import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyVoiceVerifierV1Freeze,
  voiceVerifierV1TextSha256,
} from "./verify-voice-verifier-v1-freeze.js";

const directory = dirname(fileURLToPath(import.meta.url));

describe("Voice Verifier V1 freeze", () => {
  it("verifies the immutable specification, fixtures, and aggregate", async () => {
    const frozen = await verifyVoiceVerifierV1Freeze();
    expect(frozen.aggregateSha256).toBe("e9760a51ac9b4d5d96c1ec17bd5e672d2401deead63cbc06426f3c676a09cc5e");
    expect(frozen.files).toHaveLength(2);
  });

  it("normalizes line endings without normalizing content", async () => {
    const fixtures = await readFile(join(directory, "voice-verifier-v1-fixtures.json"), "utf8");
    // `\r?\n` keeps the simulation idempotent: on a Windows checkout the file is
    // already CRLF, and a bare `\n` -> `\r\n` rewrite would yield `\r\r\n`, which
    // normalises to two newlines and changes the hash. This asserts that CRLF input
    // hashes identically to LF input on any runner.
    expect(voiceVerifierV1TextSha256(fixtures.replace(/\r?\n/gu, "\r\n")))
      .toBe(voiceVerifierV1TextSha256(fixtures));
    expect(voiceVerifierV1TextSha256(`${fixtures} `)).not.toBe(voiceVerifierV1TextSha256(fixtures));
  });
});
