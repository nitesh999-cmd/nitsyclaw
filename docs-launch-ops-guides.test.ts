import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("launch operations docs", () => {
  it("documents architecture, environment, and manual QA gates", () => {
    for (const file of [
      "docs/architecture.md",
      "docs/env-guide.md",
      "docs/manual-qa-checklist.md",
    ]) {
      expect(existsSync(file), `${file} should exist`).toBe(true);
    }

    const architecture = readFileSync("docs/architecture.md", "utf8");
    expect(architecture).toContain("Dashboard");
    expect(architecture).toContain("WhatsApp bot");
    expect(architecture).toContain("command_jobs");

    const env = readFileSync("docs/env-guide.md", "utf8");
    expect(env).toContain("DATABASE_URL_DIRECT");
    expect(env).toContain("ENCRYPTION_KEY");
    expect(env).toContain("NITSYCLAW_DASHBOARD_PASSWORD");
    expect(env).toContain("NITSYCLAW_SECRET_ROOT");
    expect(env).toContain("WHATSAPP_SESSION_DIR");

    const deploy = readFileSync("docs/deploy.md", "utf8");
    expect(deploy).toContain("NITSYCLAW_SECRET_ROOT");
    expect(deploy).toContain("WHATSAPP_SESSION_DIR");
    expect(deploy).not.toContain("mounted at `/app/.wa-session`");

    const qa = readFileSync("docs/manual-qa-checklist.md", "utf8");
    expect(qa).toContain("Unclear request");
    expect(qa).toContain("Risky request");
    expect(qa).toContain("rollback");
  });
});
