import { describe, expect, it } from "vitest";
import { InboundRoutingHealth } from "./whatsapp-inbound-health.js";

describe("InboundRoutingHealth", () => {
  it("stays ok while inbound routing works", () => {
    const health = new InboundRoutingHealth();
    health.recordAccepted();
    health.recordDrop("duplicate_event");
    health.recordDrop("bot_echo");

    const snapshot = health.snapshot();
    expect(snapshot.status).toBe("ok");
    expect(snapshot.acceptedCount).toBe(1);
    expect(snapshot.droppedCount).toBe(2);
    expect(snapshot.ownerSelfChatIdentityFailures).toBe(0);
  });

  it("flags repeated owner self-chat identity failures", () => {
    const health = new InboundRoutingHealth();
    health.recordDrop("lid_identity_unresolved");
    expect(health.snapshot().status).toBe("ok");

    health.recordDrop("lid_identity_unresolved");
    const snapshot = health.snapshot();
    expect(snapshot.status).toBe("degraded");
    expect(snapshot.ownerSelfChatIdentityFailures).toBe(2);
    expect(snapshot.lastIdentityFailureAt).toBeTruthy();
  });

  it("does not treat a correct rejection of another person as an identity failure", () => {
    const health = new InboundRoutingHealth();
    health.recordDrop("lid_identity_mismatch");
    health.recordDrop("lid_identity_mismatch");
    health.recordDrop("not_self_chat");

    const snapshot = health.snapshot();
    expect(snapshot.status).toBe("ok");
    expect(snapshot.ownerSelfChatIdentityFailures).toBe(0);
    expect(snapshot.dropsByReason.lid_identity_mismatch).toBe(2);
  });

  it("recovers once a genuine owner message is accepted again", () => {
    const health = new InboundRoutingHealth();
    health.recordDrop("lid_identity_unresolved");
    health.recordDrop("lid_identity_unresolved");
    expect(health.snapshot().status).toBe("degraded");

    health.recordAccepted();
    expect(health.snapshot().status).toBe("ok");
  });

  it("exposes counters only - no bodies, numbers, lids or message ids", () => {
    const health = new InboundRoutingHealth();
    health.recordAccepted();
    health.recordDrop("lid_identity_unresolved");

    const serialized = JSON.stringify(health.snapshot());
    expect(serialized).not.toMatch(/@lid|@c\.us|\d{9,}/);
  });
});
