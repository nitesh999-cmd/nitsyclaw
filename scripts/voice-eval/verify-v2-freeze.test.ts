import { describe, expect, it } from "vitest";
import { frozenTextSha256, verifyVoiceSmokeV2Freeze } from "./verify-v2-freeze.js";

describe("NITSYCLAW-VOICE-SMOKE-V2 freeze", () => {
  it("rejects silent scorer or corpus drift", async () => {
    const frozen = await verifyVoiceSmokeV2Freeze();
    expect(frozen.aggregateSha256).toBe("d169f8584a158af92463bf84ad7afa257d2daeb5d2ed13d4df3b585e28115d7b");
    expect(frozen.files).toHaveLength(2);
  });

  it("is stable across Git LF and Windows CRLF checkouts", () => {
    expect(frozenTextSha256("line one\nline two\n")).toBe(frozenTextSha256("line one\r\nline two\r\n"));
  });
});
