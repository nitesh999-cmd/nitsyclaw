import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const mutatingRoutes = [
  "apps/dashboard/src/app/api/auth/login/route.ts",
  "apps/dashboard/src/app/api/auth/logout/route.ts",
  "apps/dashboard/src/app/api/chat/route.ts",
  "apps/dashboard/src/app/api/chat/stream/route.ts",
  "apps/dashboard/src/app/api/data/delete/route.ts",
  "apps/dashboard/src/app/api/operator/jobs/route.ts",
  "apps/dashboard/src/app/api/queue/update/route.ts",
];

describe("dashboard mutating routes", () => {
  it("enforces same-origin requests before state-changing work", () => {
    for (const route of mutatingRoutes) {
      const source = readFileSync(route, "utf8");
      expect(source, route).toContain("requireSameOrigin");
    }
  });

  it("disables caching in state-changing API handlers", () => {
    for (const route of mutatingRoutes) {
      const source = readFileSync(route, "utf8");
      expect(source, route).toContain("Cache-Control");
      expect(source, route).toContain("no-store");
    }
  });
});
