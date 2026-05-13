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
  redactAuditString: (value: string) => value,
  sanitizeAuditPayload: (value: unknown) => value,
}));

vi.mock("@nitsyclaw/shared/notify", () => ({
  pushNotify: mocks.pushNotify,
}));

vi.mock("@nitsyclaw/shared/utils", () => ({
  encryptForStorage: mocks.encryptForStorage,
  hashPhone: mocks.hashPhone,
}));

const {
  pendingFeatureQueueFingerprint,
  resetBuildAgentNotificationGuardsForTest,
  runDailyBuildAgent,
} = await import("./build-agent.js");

describe("runDailyBuildAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetBuildAgentNotificationGuardsForTest();
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

  it("sends WhatsApp queue summary without ntfy for ordinary pending features", async () => {
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
    expect(mocks.pushNotify).not.toHaveBeenCalled();
    expect(deps.whatsapp.send).toHaveBeenCalledTimes(1);
    expect(mocks.insertMessage).toHaveBeenCalledTimes(1);
  });

  it("sends a high-priority ntfy push for critical pending bugs after WhatsApp summary", async () => {
    mocks.listPendingFeatureRequests.mockResolvedValue([
      featureRequest("05608bae", new Date("2026-05-09T00:00:00.000Z"), {
        type: "bug",
        severity: "P1",
      }),
    ]);
    mocks.claimSystemNotification.mockResolvedValue(true);
    const deps = fakeDeps();

    await runDailyBuildAgent(deps, "+61430008008");

    expect(deps.whatsapp.send).toHaveBeenCalledTimes(1);
    expect(mocks.insertMessage).toHaveBeenCalledTimes(1);
    expect(mocks.pushNotify).toHaveBeenCalledTimes(1);
    expect(mocks.pushNotify).toHaveBeenCalledWith(
      "1 critical pending item(s). Details sent on WhatsApp.",
      expect.objectContaining({
        title: "NitsyClaw: critical queue item",
        priority: "high",
        tags: ["warning"],
      }),
    );
  });

  it("rate-limits critical phone push even when the WhatsApp queue summary is fresh", async () => {
    mocks.listPendingFeatureRequests.mockResolvedValue([
      featureRequest("05608bae", new Date("2026-05-09T00:00:00.000Z"), {
        type: "bug",
        severity: "P0",
      }),
    ]);
    mocks.claimSystemNotification
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const deps = fakeDeps();

    await runDailyBuildAgent(deps, "+61430008008");

    expect(mocks.claimSystemNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: "build-agent-feature-notify" }),
    );
    expect(mocks.claimSystemNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: "build-agent-feature-ntfy-rate-limit",
        fingerprint: expect.stringContaining("critical-pending-feature-summary:"),
      }),
    );
    expect(mocks.pushNotify).not.toHaveBeenCalled();
    expect(deps.whatsapp.send).toHaveBeenCalledTimes(1);
    expect(mocks.insertMessage).toHaveBeenCalledTimes(1);
  });

  it("uses ntfy fallback if WhatsApp cannot receive the queue summary", async () => {
    mocks.listPendingFeatureRequests.mockResolvedValue([featureRequest("05608bae")]);
    mocks.claimSystemNotification.mockResolvedValue(true);
    const deps = fakeDeps();
    deps.whatsapp.send.mockRejectedValueOnce(new Error("send failed"));

    await runDailyBuildAgent(deps, "+61430008008");

    expect(mocks.insertMessage).not.toHaveBeenCalled();
    expect(mocks.pushNotify).toHaveBeenCalledTimes(1);
    expect(mocks.pushNotify).toHaveBeenCalledWith(
      "Build queue summary could not be sent on WhatsApp. 1 pending item(s).",
      expect.objectContaining({
        title: "NitsyClaw: WhatsApp queue failed",
        priority: "high",
        tags: ["warning"],
      }),
    );
  });

  it("suppresses repeated ntfy pushes in-process even if the db claim repeats", async () => {
    mocks.listPendingFeatureRequests.mockResolvedValue([
      featureRequest("05608bae", new Date("2026-05-09T00:00:00.000Z"), {
        type: "bug",
        severity: "P1",
      }),
    ]);
    mocks.claimSystemNotification.mockResolvedValue(true);
    const deps = fakeDeps();

    await runDailyBuildAgent(deps, "+61430008008");
    await runDailyBuildAgent(deps, "+61430008008");

    expect(mocks.pushNotify).toHaveBeenCalledTimes(1);
    expect(deps.whatsapp.send).toHaveBeenCalledTimes(2);
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

function featureRequest(
  id: string,
  createdAt = new Date("2026-05-09T00:00:00.000Z"),
  overrides: Partial<{
    type: string;
    severity: string | null;
  }> = {},
) {
  return {
    id,
    description: "Read and send emails on behalf of the user via Gmail and Outlook",
    type: overrides.type ?? "feature",
    severity: overrides.severity ?? null,
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
