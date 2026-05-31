import { describe, expect, it } from "vitest";
import { parseSafeCommand } from "../src/ops/safe-command-parser.js";

describe("safe command parser", () => {
  it("extracts risky send commands before action", () => {
    const command = parseSafeCommand({ text: "Send this SMS to John tomorrow at 10 am" });

    expect(command).toMatchObject({
      intent: "send",
      channel: "sms",
      risk: "high",
      requiresConfirmation: true,
      dateText: "tomorrow",
    });
    expect(command.target).toContain("this SMS to John");
    expect(command.confirmationReason).toContain("send");
  });

  it("treats local notes and reminders as low-risk unless they leave the system", () => {
    expect(parseSafeCommand({ text: "remember passport is in top drawer" })).toMatchObject({
      intent: "remember",
      channel: "dashboard",
      risk: "low",
      requiresConfirmation: false,
    });
    expect(parseSafeCommand({ text: "remind me tomorrow to call Mukesh" })).toMatchObject({
      intent: "call",
      channel: "phone",
      risk: "high",
      requiresConfirmation: true,
    });
  });

  it("labels private file access as medium risk", () => {
    const command = parseSafeCommand({ text: "search my Google Drive for the AGL PDF" });

    expect(command).toMatchObject({
      intent: "search",
      channel: "files",
      risk: "medium",
      requiresConfirmation: false,
    });
  });

  it("approval-gates money, booking, and account connection commands", () => {
    for (const text of [
      "pay the electricity bill today",
      "book a dentist appointment next week",
      "connect my Gmail account",
    ]) {
      const command = parseSafeCommand({ text });
      expect(command.risk).toBe("high");
      expect(command.requiresConfirmation).toBe(true);
    }
  });
});
