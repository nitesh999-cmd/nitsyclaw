"use strict";

const fs = require("node:fs");
const net = require("node:net");

const originalConnect = net.Socket.prototype.connect;
const originalFetch = globalThis.fetch;
const auditPath = process.env.NITSYCLAW_LOCAL_NETWORK_AUDIT_FILE;

function isLoopback(host) {
  const normalized = String(host || "localhost").replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function targetFromArgs(args) {
  const first = args[0];
  if (typeof first === "string") {
    if (first.startsWith("\\\\.\\pipe\\")) return { local: true, target: "local-pipe" };
    return { local: false, target: first };
  }
  if (typeof first === "number") {
    const host = typeof args[1] === "string" ? args[1] : "localhost";
    return { local: isLoopback(host), target: host };
  }
  if (first && typeof first === "object") {
    if (typeof first.path === "string") return { local: true, target: "local-pipe" };
    const host = first.host || first.hostname || "localhost";
    return { local: isLoopback(host), target: String(host) };
  }
  return { local: true, target: "localhost" };
}

function recordBlocked(target) {
  if (!auditPath) return;
  try {
    const stack = String(new Error().stack || "")
      .split(/\r?\n/)
      .slice(2, 9)
      .map((line) => line.trim().slice(0, 300));
    fs.appendFileSync(auditPath, `${JSON.stringify({ blocked: String(target).slice(0, 200), stack })}\n`, "utf8");
  } catch {
    // The network block remains active even if audit recording is unavailable.
  }
}

function recordMocked(target) {
  if (!auditPath) return;
  try {
    fs.appendFileSync(auditPath, `${JSON.stringify({ mocked: String(target).slice(0, 200) })}\n`, "utf8");
  } catch {
    // The local response remains active even if audit recording is unavailable.
  }
}

net.Socket.prototype.connect = function guardedConnect(...args) {
  const target = targetFromArgs(args);
  if (!target.local) {
    recordBlocked(target.target);
    throw new Error(`Local-only demo blocked a non-loopback connection to ${target.target}`);
  }
  return originalConnect.apply(this, args);
};

if (typeof originalFetch === "function") {
  globalThis.fetch = async function guardedFetch(input, init) {
    const raw = typeof input === "string" || input instanceof URL ? String(input) : String(input && input.url || "");
    try {
      const url = new URL(raw);
      if (!isLoopback(url.hostname)) {
        if (url.hostname === "registry.npmjs.org" && url.pathname === "/-/package/next/dist-tags") {
          recordMocked("next-version-check");
          return new Response(JSON.stringify({ latest: "0.0.0", canary: "0.0.0" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        recordBlocked(`fetch:${url.hostname}`);
        throw new Error(`Local-only demo blocked fetch to ${url.hostname}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Local-only demo blocked")) throw error;
    }
    return originalFetch.call(this, input, init);
  };
}
