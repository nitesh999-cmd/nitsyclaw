import { describe, expect, it } from "vitest";
import { createExportProof, hashSession, verifyExportProof } from "./data-export-proof";

describe("data export proof", () => {
  const secret = "test-secret";
  const sessionToken = "session-token";
  const exportedAt = "2026-05-05T02:15:00.000Z";
  const nowMs = Date.parse("2026-05-05T02:30:00.000Z");

  it("accepts a signed complete proof for the same session and snapshot", () => {
    const proof = createExportProof({
      snapshotId: "export_20260505021500",
      exportedAt,
      complete: true,
      counts: { messages: 2 },
      sessionHash: hashSession(sessionToken),
    }, secret);

    expect(verifyExportProof({
      proof,
      snapshotId: "export_20260505021500",
      sessionToken,
      nowMs,
      secret,
    })?.counts.messages).toBe(2);
  });

  it("rejects forged, stale, truncated, and different-session proofs", () => {
    const valid = createExportProof({
      snapshotId: "export_20260505021500",
      exportedAt,
      complete: true,
      counts: { messages: 2 },
      sessionHash: hashSession(sessionToken),
    }, secret);
    const truncated = createExportProof({
      snapshotId: "export_20260505021500",
      exportedAt,
      complete: false,
      counts: { messages: 5000 },
      sessionHash: hashSession(sessionToken),
    }, secret);

    expect(verifyExportProof({
      proof: "export_20260505021500",
      snapshotId: "export_20260505021500",
      sessionToken,
      nowMs,
      secret,
    })).toBeNull();
    expect(verifyExportProof({
      proof: valid,
      snapshotId: "export_20260505021500",
      sessionToken: "different-session",
      nowMs,
      secret,
    })).toBeNull();
    expect(verifyExportProof({
      proof: truncated,
      snapshotId: "export_20260505021500",
      sessionToken,
      nowMs,
      secret,
    })).toBeNull();
    expect(verifyExportProof({
      proof: valid,
      snapshotId: "export_20260505021500",
      sessionToken,
      nowMs: Date.parse("2026-05-07T02:30:00.000Z"),
      secret,
    })).toBeNull();
  });
});
