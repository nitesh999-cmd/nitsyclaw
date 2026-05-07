import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard safe user-facing errors", () => {
  test("chat routes do not return raw internal exception messages", () => {
    for (const route of [
      "apps/dashboard/src/app/api/chat/route.ts",
      "apps/dashboard/src/app/api/chat/stream/route.ts",
    ]) {
      const source = readFileSync(route, "utf8");
      expect(source, route).not.toContain("Agent error:");
      expect(source, route).not.toContain("message: msg");
      expect(source, route).not.toContain("const msg = e instanceof Error ? e.message : String(e)");
      expect(source, route).toContain("logDashboardError");
      expect(source, route).toContain("I hit a server problem while answering. Try again shortly.");
    }
  });

  test("health and data controls use generic failure messages with server logs", () => {
    const files = [
      "apps/dashboard/src/app/health/page.tsx",
      "apps/dashboard/src/app/api/data/export/route.ts",
      "apps/dashboard/src/app/api/data/delete/route.ts",
      "apps/dashboard/src/app/api/integrations/spotify/callback/route.ts",
      "apps/dashboard/src/app/api/integrations/spotify/status/route.ts",
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("logDashboardError");
      expect(source, file).not.toContain("e instanceof Error ? e.message : String(e)");
    }
  });

  test("dashboard chat does not attach Anthropic server-side web search to private history", () => {
    for (const route of [
      "apps/dashboard/src/app/api/chat/route.ts",
      "apps/dashboard/src/app/api/chat/stream/route.ts",
    ]) {
      const source = readFileSync(route, "utf8");
      expect(source, route).not.toContain("web_search_20250305");
      expect(source, route).not.toContain('name: "web_search"');
    }
  });

  test("database construction errors do not expose environment shape", () => {
    const source = readFileSync("packages/shared/src/db/client.ts", "utf8");

    expect(source).toContain("DATABASE_URL is required to construct DB client");
    expect(source).not.toContain("process.env.DATABASE_URL=");
    expect(source).not.toContain("set(");
  });
});
