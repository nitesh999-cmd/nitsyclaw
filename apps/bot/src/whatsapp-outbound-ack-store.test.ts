import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSystemHeartbeat, upsertSystemHeartbeat } from "@nitsyclaw/shared/db";
import {
  WhatsAppHeartbeatAckStateStore,
  WHATSAPP_OUTBOUND_ACK_HEARTBEAT_SOURCE,
} from "./whatsapp-outbound-ack-store.js";
import type { WhatsAppOutboundAckState } from "./whatsapp-outbound-submission.js";

vi.mock("@nitsyclaw/shared/db", () => ({
  getSystemHeartbeat: vi.fn(),
  upsertSystemHeartbeat: vi.fn(async () => ({})),
}));

function state(overrides: Partial<WhatsAppOutboundAckState["attempts"][number]> = {}): WhatsAppOutboundAckState {
  return {
    version: 1,
    attempts: [{
      attemptId: "attempt-hash-safe",
      requestedRecipientHash: "recipient-hash",
      bodyHash: "body-hash",
      createdAtMs: 1,
      ackDeadlineAtMs: 100,
      clientAccepted: true,
      localSelfEchoObserved: false,
      userVisibleConfirmed: false,
      ack: 0,
      ...overrides,
    }],
    earlyAcks: [],
  };
}

describe("WhatsAppHeartbeatAckStateStore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the sanitized state envelope from the dedicated heartbeat", async () => {
    const snapshot = state();
    vi.mocked(getSystemHeartbeat).mockResolvedValue({ metadata: { state: snapshot } } as never);
    const store = new WhatsAppHeartbeatAckStateStore({} as never);

    await expect(store.load()).resolves.toEqual(snapshot);
    expect(getSystemHeartbeat).toHaveBeenCalledWith(
      {},
      WHATSAPP_OUTBOUND_ACK_HEARTBEAT_SOURCE,
    );
  });

  it.each([
    [state(), "pending"],
    [state({ deadlineExpiredAtMs: 101 }), "conditional"],
    [state({ ack: 1 }), "ok"],
  ])("persists lifecycle state with heartbeat status %s", async (snapshot, expectedStatus) => {
    const store = new WhatsAppHeartbeatAckStateStore({} as never);
    await store.save(snapshot);

    expect(upsertSystemHeartbeat).toHaveBeenCalledWith({}, {
      source: WHATSAPP_OUTBOUND_ACK_HEARTBEAT_SOURCE,
      status: expectedStatus,
      metadata: { state: snapshot },
    });
  });
});
