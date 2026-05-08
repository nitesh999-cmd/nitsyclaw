import { describe, expect, it } from "vitest";

import { speechRecognitionErrorMessage } from "./voice-errors.js";

describe("speechRecognitionErrorMessage", () => {
  it("gives specific recovery copy for common voice input failures", () => {
    expect(speechRecognitionErrorMessage("not-allowed")).toContain("Microphone is blocked");
    expect(speechRecognitionErrorMessage("service-not-allowed")).toContain("Microphone is blocked");
    expect(speechRecognitionErrorMessage("no-speech")).toContain("did not catch anything");
    expect(speechRecognitionErrorMessage("audio-capture")).toContain("No microphone was found");
    expect(speechRecognitionErrorMessage("network")).toContain("You can still type");
    expect(speechRecognitionErrorMessage("aborted")).toContain("stopped");
  });

  it("falls back to safe non-blocking copy for unknown errors", () => {
    expect(speechRecognitionErrorMessage("bad-grammar")).toBe("Voice input could not start. You can still type your message.");
    expect(speechRecognitionErrorMessage(undefined)).toBe("Voice input could not start. You can still type your message.");
  });
});
