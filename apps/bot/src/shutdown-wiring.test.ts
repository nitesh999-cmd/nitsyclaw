import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The shutdown path lives inside main(), which starts WhatsApp and the
 * scheduler, so it cannot be invoked from a unit test without launching the
 * whole bot. Asserting the wiring at source level is the honest way to keep the
 * guarantee — the same approach the dashboard route privacy tests use.
 */
describe("graceful shutdown wiring", () => {
  const source = readFileSync("apps/bot/src/index.ts", "utf8");

  it("awaits closeDb on the graceful shutdown path", () => {
    expect(source).toContain("closeDb");
    expect(source).toContain("await closeDb();");
  });

  it("registers the shutdown handler for both signals", () => {
    expect(source).toContain('process.on("SIGINT"');
    expect(source).toContain('process.on("SIGTERM"');
  });

  it("still releases database sockets when shutdown otherwise fails", () => {
    expect(source).toContain("await closeDb().catch(() => undefined);");
  });

  it("documents that forced termination cannot run cleanup", () => {
    expect(source).toMatch(/Stop-Process -Force|SIGKILL/);
  });
});
