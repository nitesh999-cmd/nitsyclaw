import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimSystemNotification: vi.fn(),
  encryptForStorage: vi.fn((text: string) => `encrypted:${text}`),
  hashPhone: vi.fn(() => "owner-hash"),
  insertMessage: vi.fn(),
  listPendingFeatureRequests: vi.fn(),
  pushNotify: vi.fn(),
}));

vi.mock("@nitsyclaw/shared/db", () => ({
  claimSystemNotification: mocks.claimSystemNotification,
  insertMessage: mocks.insertMessage,
  listPendingFeatureRequests: mocks.listPendingFeatureRequests,
}));

vi.mock("@nitsyclaw/shared/notify", () => ({
  pushNotify: mocks.pushNotify,
}));

vi.mock("@nitsyclaw/shared/utils", () => ({
  encryptForStorage: mocks.encryptForStorage,
  hashPhone: mocks.hashPhone,
}));

const { pendingFeatureQueueFingerprint, runDailyBuildAgent } = await import("./build-agent.js");

describe("runDailyBuildAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.insertMessage.mockResolvedValue({});
    mocks.pushNotify.mockResolvedValue(undefined);
  });

  it("does not send idle notifications when the queue is empty", async () => {
    mocks.listPendingFeatureRequests.mockResolvedValue([]);
    const deps = fakeDeps();

    await runDailyBuildAgent(deps, "+61430008008");

    expect(mocks.claimSystemNotification).not.toHaveBeenCalled();
    expect(mocks.pushNotify).not.toHaveBeenCalled();
    expect(mocks.insertMessage).not.toHaveBeenCalled();
  });

  it("suppresses repeated notifications for the same pending queue state", async () => {
    mocks.listPendingFeatureRequests.mockResolvedValue([featureRequest("05608bae")]);
    mocks.claimSystemNotification.mockResolvedValue(false);
    const deps = fakeDeps();

    await runDailyBuildAgent(deps, "+61430008008");

    expect(mocks.pushNotify).not.toHaveBeenCalled();
    expect(mocks.insertMessage).not.toHaveBeenCalled();
  });

  it("sends one notification when the pending queue state is claimed", async () => {
    mocks.listPendingFeatureRequests.mockResolvedValue([featureRequest("05608bae")]);
    mocks.claimSystemNotification.mockResolvedValue(true);
    const deps = fakeDeps();

    await runDailyBuildAgent(deps, "+61430008008");

    expect(mocks.claimSystemNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: "build-agent-feature-notify",
        cooldownMs: 20 * 60 * 60 * 1000,
        metadata: { pendingCount: 1 },
      }),
    );
    expect(mocks.pushNotify).toHaveBeenCalledTimes(1);
    expect(mocks.pushNotify).toHaveBeenCalledWith(
      "1 pending feature(s). Details on WhatsApp.",
      expect.objectContaining({ title: "NitsyClaw: features pending" }),
    );
    expect(deps.whatsapp.send).toHaveBeenCalledTimes(1);
    expect(mocks.insertMessage).toHaveBeenCalledTimes(1);
  });

  it("uses a stable fingerprint independent of database ordering", () => {
    const first = [
      featureRequest("bbbbbbbb", new Date("2026-05-09T01:00:00.000Z")),
      featureRequest("aaaaaaaa", new Date("2026-05-09T02:00:00.000Z")),
    ];
    const second = [first[1]!, first[0]!];

    expect(pendingFeatureQueueFingerprint(first)).toBe(pendingFeatureQueueFingerprint(second));
  });
});

function fakeDeps() {
  const whatsappSend = vi.fn().mockResolvedValue(undefined);
  return {
    db: {},
    now: () => new Date("2026-05-09T05:00:00.000Z"),
    timezone: "Australia/Melbourne",
    whatsapp: {
      send: whatsappSend,
    },
  } as unknown as Parameters<typeof runDailyBuildAgent>[0] & {
    whatsapp: { send: typeof whatsappSend };
  };
}

function featureRequest(id: string, createdAt = new Date("2026-05-09T00:00:00.000Z")) {
  return {
    id,
    description: "Read and send emails on behalf of the user via Gmail and Outlook",
    type: "feature",
    severity: null,
    size: "M",
    status: "pending",
    source: "whatsapp",
    requestedBy: "owner",
    implementationNotes: null,
    prUrl: null,
    rejectionReason: null,
    dedupeKey: null,
    createdAt,
    completedAt: null,
  };
}
