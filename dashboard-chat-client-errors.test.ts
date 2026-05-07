import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard chat client errors", () => {
  test("chat UI does not render raw fetch exception messages", () => {
    const source = readFileSync("apps/dashboard/src/app/chat/page.tsx", "utf8");

    expect(source).not.toContain("fbErr instanceof Error ? fbErr.message : String(fbErr)");
    expect(source).not.toContain('setAssistantContent("Error: " +');
    expect(source).not.toContain("console.error(");
    expect(source).not.toContain("stream error:");
    expect(source).not.toContain("parseErr");
    expect(source).not.toContain("primerErr");
    expect(source).toContain("I could not get a reply. Try again shortly.");
  });
});
