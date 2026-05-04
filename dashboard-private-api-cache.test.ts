import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const privateGetRoutes = [
  "apps/dashboard/src/app/api/chat/history/route.ts",
  "apps/dashboard/src/app/api/data/export/route.ts",
  "apps/dashboard/src/app/api/expenses/export/route.ts",
  "apps/dashboard/src/app/api/integrations/spotify/connect/route.ts",
  "apps/dashboard/src/app/api/integrations/spotify/callback/route.ts",
  "apps/dashboard/src/app/api/integrations/spotify/status/route.ts",
];

describe("dashboard private API cache policy", () => {
  test("private GET routes explicitly disable caching", () => {
    for (const route of privateGetRoutes) {
      const source = readFileSync(route, "utf8");
      expect(source, route).toContain("Cache-Control");
      expect(source, route).toContain("no-store");
    }
  });

  test("chat history does not return raw internal exception messages", () => {
    const source = readFileSync("apps/dashboard/src/app/api/chat/history/route.ts", "utf8");

    expect(source).toContain("Unable to load chat history.");
    expect(source).not.toContain("e instanceof Error ? e.message");
  });

  test("middleware disables caching on auth gates and protected responses", () => {
    const source = readFileSync("apps/dashboard/src/middleware.ts", "utf8");

    expect(source).toContain('response.headers.set("Cache-Control", "no-store")');
  });

  test("chat APIs disable caching on private success responses", () => {
    const chatSource = readFileSync("apps/dashboard/src/app/api/chat/route.ts", "utf8");
    const streamSource = readFileSync("apps/dashboard/src/app/api/chat/stream/route.ts", "utf8");

    expect(chatSource).toContain("}, { headers: NO_STORE });");
    expect(streamSource).toContain('"Cache-Control": "no-store, no-transform"');
    expect(streamSource).not.toContain('"Cache-Control": "no-cache, no-transform"');
  });
});
