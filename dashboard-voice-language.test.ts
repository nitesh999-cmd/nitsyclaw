import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard voice language controls", () => {
  test("chat page lets users change and persist speech recognition language", () => {
    const source = readFileSync("apps/dashboard/src/app/chat/page.tsx", "utf8");

    expect(source).toContain("nitsyclaw-speech-language");
    expect(source).toContain("English (Australia)");
    expect(source).toContain("Hindi / Hinglish");
    expect(source).toContain("setSpeechLanguage");
    expect(source).toContain("r.lang = speechLanguage");
  });
});
