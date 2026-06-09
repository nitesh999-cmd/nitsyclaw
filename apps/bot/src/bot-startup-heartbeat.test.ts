import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("bot startup heartbeat safety", () => {
  it("does not let runtime heartbeat write failures kill WhatsApp recovery", () => {
    const source = readFileSync("apps/bot/src/index.ts", "utf8");

    expect(source).toContain("[boot] startup heartbeat failed; continuing");
    expect(source).toContain("[boot] ready heartbeat failed; continuing");
    expect(source).toMatch(/upsertSystemHeartbeat\(db,[\s\S]*status: "starting"[\s\S]*\.catch/);
    expect(source).toMatch(/upsertSystemHeartbeat\(db,[\s\S]*status: "ok"[\s\S]*\.catch/);
  });
});
