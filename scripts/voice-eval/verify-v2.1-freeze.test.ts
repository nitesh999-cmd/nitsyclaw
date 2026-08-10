import { describe, expect, it } from "vitest";
import { frozenV21TextSha256, verifyVoiceSmokeV21Freeze } from "./verify-v2.1-freeze.js";

describe("NITSYCLAW-VOICE-SMOKE-V2.1 held-out freeze", () => {
  it("rejects silent specification, corpus or scorer drift", async () => {
    const frozen = await verifyVoiceSmokeV21Freeze();
    expect(frozen.schemaVersion).toBe("NITSYCLAW-VOICE-SMOKE-V2.1-HELD-OUT-FREEZE");
    expect(frozen.files).toHaveLength(3);
    expect(frozen.aggregateSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("is stable across Git LF and Windows CRLF checkouts", () => {
    expect(frozenV21TextSha256("line one\nline two\n")).toBe(frozenV21TextSha256("line one\r\nline two\r\n"));
  });
});
