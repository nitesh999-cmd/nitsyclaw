import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const API_ROOT = "apps/dashboard/src/app/api";

function routeFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const fullPath = join(dir, entry);
      return statSync(fullPath).isDirectory() ? routeFiles(fullPath) : [fullPath];
    })
    .filter((path) => path.endsWith("route.ts"));
}

describe("dashboard red-team route policy", () => {
  it("discovers every POST API route and requires same-origin or build-agent auth protection", () => {
    const postRoutes = routeFiles(API_ROOT).filter((path) =>
      readFileSync(path, "utf8").includes("export async function POST"),
    );

    expect(postRoutes.length).toBeGreaterThan(5);
    for (const route of postRoutes) {
      const source = readFileSync(route, "utf8");
      const hasSameOrigin = source.includes("requireSameOrigin");
      const hasBuildAgentAuth = source.includes("requireBuildAgentAuth");
      expect(hasSameOrigin || hasBuildAgentAuth, route).toBe(true);
    }
  });
});

