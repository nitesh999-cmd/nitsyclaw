import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

// The readiness gate is a PowerShell script, so it cannot be imported and exercised as a
// function the way the other script tests here do. These are regression tests over its
// source: each one pins a property whose absence previously made the gate wrong or flaky.
// They are deliberately narrow — they prove the gate still ASKS the right questions. They
// do not prove Railway answers them; that is what running the gate does.

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "railway-whatsapp-ready.ps1");
const script = readFileSync(scriptPath, "utf8");

// Negative assertions run against executable lines only. The header comment deliberately
// quotes the retired log assertions and the old `2>&1` bug to explain why they are gone, and
// a naive whole-file check would fail on that explanation.
const code = script
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("#"))
  .join("\n");

describe("Railway readiness gate — asserted invariant", () => {
  it("checks /healthz, the no-client health reason, and the absent pairing surface", () => {
    expect(script).toContain("/healthz");
    expect(script).toContain("runtime_not_owner");
    expect(script).toContain("/recovery/whatsapp-qr");
  });

  it("requires whatsapp.ready to be false, not true", () => {
    // Railway must never hold the session — the laptop owns it.
    expect(script).toMatch(/\$health\.whatsapp\.ready\s+-ne\s+\$false/);
  });

  it("requires the pairing surface to return 404", () => {
    expect(script).toMatch(/\$qrCode\s+-ne\s+404/);
  });

  it("does not assert the retired Railway-owns-WhatsApp log lines", () => {
    // These only appear when Railway runs its own WhatsApp client. Asserting them made the
    // gate unpassable after the laptop cutover.
    expect(code).not.toContain("[wwebjs] client ready");
    expect(code).not.toContain("[boot] WhatsApp ready");
  });
});

describe("Railway readiness gate — JSON parsing", () => {
  it("never feeds a stderr-merged stream into ConvertFrom-Json", () => {
    // `& cli @args 2>&1 | ConvertFrom-Json` broke on pnpm dlx install chatter, which starts
    // with "Progress: ...". The leading "P" made the parse fail on a cold cache only, so the
    // gate passed or failed depending on whether a package cache happened to be warm.
    expect(code).not.toMatch(/2>&1/);
  });

  it("redirects stderr away from the parsed stream", () => {
    expect(script).toMatch(/2>\s*\$errPath/);
  });

  it("slices from the first JSON delimiter as a backstop", () => {
    expect(script).toContain("$text.Substring($start)");
  });
});

describe("Railway readiness gate — CLI scoping", () => {
  it("scopes every CLI invocation with project, environment and service", () => {
    expect(script).toMatch(/function Get-ScopeArgs/);
    expect(script).toMatch(/"--project",\s*\$ProjectId/);
    expect(script).toMatch(/"--environment",\s*\$Environment/);
    expect(script).toMatch(/"--service",\s*\$Service/);
  });

  it("passes the scope to the status call, which previously ran unscoped", () => {
    expect(script).toMatch(/@\("status",\s*"--json"\)\s*\+\s*\(Get-ScopeArgs\)/);
  });

  it("does not pass --service to status, which rejects it", () => {
    // `railway status` accepts --project and --environment only. Passing --service made it
    // exit 2 with "unexpected argument '--service' found". A live run caught this; the
    // source-level tests could not, because the argument list looked correct in isolation.
    const scopeArgs = code.match(/function Get-ScopeArgs\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(scopeArgs).not.toBe("");
    expect(scopeArgs).toContain("--project");
    expect(scopeArgs).toContain("--environment");
    expect(scopeArgs).not.toContain("--service");
    // The service-scoped variant still exists for subcommands that accept it.
    expect(code).toMatch(/function Get-ServiceScopeArgs/);
  });

  it("has no CLI invocation that bypasses the scope helper", () => {
    const invocations = script.match(/-RailwayArgs\s+\(([^)]*\))*/g) ?? [];
    expect(invocations.length).toBeGreaterThan(0);
    for (const invocation of invocations) {
      expect(invocation).toContain("Get-ScopeArgs");
    }
  });
});
