import { describe, expect, it } from "vitest";
import {
  resolveWhatsAppRuntimeMode,
  assertWhatsAppRuntimeAllowed,
  WHATSAPP_RUNTIME_OWNERS,
} from "./whatsapp-runtime-guard";

/**
 * Ownership matrix for the laptop-owned architecture.
 *
 * The laptop holds the WhatsApp session. Two live clients on one session
 * invalidate each other and force a re-pair, so which runtime may construct a
 * client is a decision, never an accident of where a process booted.
 *
 * `no-client` is the row that matters most. A Railway container that is not the
 * owner still has to answer its healthcheck: if it throws before the health
 * server starts, the deployment never goes healthy, Railway retries and keeps
 * the PREVIOUS build — the older one with no ownership check at all. Serving
 * health while refusing to build a client is what actually retires that build.
 */

const RAILWAY = { RAILWAY_ENVIRONMENT_ID: "env-x", RAILWAY_DEPLOYMENT_ID: "dep-x" } as const;
const ALLOW = { NITSYCLAW_ALLOW_LOCAL_WHATSAPP: "1" } as const;

type Expected = "client" | "no-client" | "throw";

const MATRIX: Array<{ runtime: string; owner: string; env: Record<string, string>; expect: Expected }> = [
  // Railway runtime
  { runtime: "railway", owner: "railway", env: { ...RAILWAY, NITSYCLAW_WHATSAPP_RUNTIME_OWNER: "railway" }, expect: "client" },
  { runtime: "railway", owner: "laptop", env: { ...RAILWAY, NITSYCLAW_WHATSAPP_RUNTIME_OWNER: "laptop" }, expect: "no-client" },
  { runtime: "railway", owner: "<unset>", env: { ...RAILWAY }, expect: "throw" },
  // Laptop runtime
  { runtime: "laptop", owner: "railway", env: { ...ALLOW, NITSYCLAW_WHATSAPP_RUNTIME_OWNER: "railway" }, expect: "throw" },
  { runtime: "laptop", owner: "laptop", env: { ...ALLOW, NITSYCLAW_WHATSAPP_RUNTIME_OWNER: "laptop" }, expect: "client" },
  { runtime: "laptop", owner: "<unset>", env: { ...ALLOW }, expect: "client" },
  // Laptop runtime without the local authorization
  { runtime: "laptop-no-allow", owner: "railway", env: { NITSYCLAW_WHATSAPP_RUNTIME_OWNER: "railway" }, expect: "throw" },
  { runtime: "laptop-no-allow", owner: "laptop", env: { NITSYCLAW_WHATSAPP_RUNTIME_OWNER: "laptop" }, expect: "throw" },
  { runtime: "laptop-no-allow", owner: "<unset>", env: {}, expect: "throw" },
];

describe("whatsapp runtime ownership matrix", () => {
  it.each(MATRIX)("$runtime runtime + owner=$owner -> $expect", ({ env, expect: want }) => {
    if (want === "throw") {
      expect(() => resolveWhatsAppRuntimeMode(env)).toThrow();
      return;
    }
    const decision = resolveWhatsAppRuntimeMode(env);
    expect(decision.mode).toBe(want);
    if (decision.mode === "no-client") expect(decision.reason).toBe("runtime_not_owner");
  });

  it("keeps the laptop's current live configuration working", () => {
    // The laptop runs today with the owner variable UNSET and ALLOW_LOCAL=1.
    // If this row ever stopped returning "client", deploying this change would
    // take the owner's WhatsApp bot down.
    expect(resolveWhatsAppRuntimeMode({ NITSYCLAW_ALLOW_LOCAL_WHATSAPP: "1" })).toEqual({ mode: "client" });
  });

  it("refuses every near-miss owner value on Railway rather than guessing", () => {
    for (const near of ["Railway", "RAILWAY", "railway-prod", "railway-2", " railway-", "laptop2", "local", ""]) {
      expect(
        () => resolveWhatsAppRuntimeMode({ ...RAILWAY, NITSYCLAW_WHATSAPP_RUNTIME_OWNER: near }),
        `"${near}" must not authorize a Railway runtime`,
      ).toThrow();
    }
    // Trimming is allowed; the trimmed value must still be an exact member.
    expect(resolveWhatsAppRuntimeMode({ ...RAILWAY, NITSYCLAW_WHATSAPP_RUNTIME_OWNER: "  railway  " })).toEqual({
      mode: "client",
    });
  });

  it("exposes exactly two owners, so a third cannot appear by accident", () => {
    expect([...WHATSAPP_RUNTIME_OWNERS]).toEqual(["laptop", "railway"]);
  });

  it("assertWhatsAppRuntimeAllowed still throws when refused and now returns the mode", () => {
    expect(() => assertWhatsAppRuntimeAllowed({ ...RAILWAY })).toThrow();
    expect(assertWhatsAppRuntimeAllowed({ ...RAILWAY, NITSYCLAW_WHATSAPP_RUNTIME_OWNER: "laptop" })).toEqual({
      mode: "no-client",
      reason: "runtime_not_owner",
    });
  });
});

describe("no-client mode never touches the session", () => {
  it("decides the mode without any filesystem access at all", () => {
    // The decision must be pure env inspection. If resolving the mode reached
    // the filesystem, a non-owner container could disturb session state simply
    // by booting. Asserted structurally: the guard module imports nothing that
    // could touch a disk.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const guard = require("node:fs").readFileSync("apps/bot/src/whatsapp-runtime-guard.ts", "utf8") as string;
    expect(guard).not.toMatch(/from\s+"node:fs"|require\("node:fs"\)|from\s+"node:path"/u);
    expect(guard).not.toMatch(/readFileSync|mkdirSync|existsSync|readdirSync/u);
    // And behaviourally: the decision is reached from env alone.
    expect(resolveWhatsAppRuntimeMode({ ...RAILWAY, NITSYCLAW_WHATSAPP_RUNTIME_OWNER: "laptop" })).toEqual({
      mode: "no-client",
      reason: "runtime_not_owner",
    });
  });

  it("startup wires whatsappEnabled from the mode and returns before client construction", () => {
    const source = readIndexSource();
    // The server is started with the flag derived from the mode...
    expect(source).toContain("whatsappEnabled: runtimeMode.mode === \"client\"");
    // ...and the no-client branch returns before the client is constructed.
    const noClientAt = source.indexOf('if (runtimeMode.mode === "no-client")');
    const clientAt = source.indexOf("new WwebjsClient(");
    const sessionDirAt = source.indexOf("sessionDir: whatsappSessionDir(");
    expect(noClientAt).toBeGreaterThan(-1);
    expect(clientAt).toBeGreaterThan(noClientAt);
    expect(sessionDirAt).toBeGreaterThan(noClientAt);
    expect(source.slice(noClientAt, clientAt)).toContain("return;");
  });

  it("serves a reason on /health rather than a bare not-ready", () => {
    expect(readIndexSource()).toContain("reason: runtimeMode.reason");
  });

  it("makes the QR recovery routes unreachable when no client exists", () => {
    const server = readServerSource();
    expect(server).toContain("!whatsappEnabled && url.pathname.startsWith(\"/recovery/whatsapp-qr\")");
    // A QR page on a build that never pairs is an ownership trap.
    const guardAt = server.indexOf("!whatsappEnabled && url.pathname.startsWith");
    const qrAt = server.indexOf('url.pathname === "/recovery/whatsapp-qr"');
    expect(guardAt).toBeGreaterThan(-1);
    expect(qrAt).toBeGreaterThan(guardAt);
  });
});

function readIndexSource(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("node:fs").readFileSync("apps/bot/src/index.ts", "utf8") as string;
}

function readServerSource(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("node:fs").readFileSync("apps/bot/src/qr-recovery-server.ts", "utf8") as string;
}
