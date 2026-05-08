import { describe, expect, it } from "vitest";
import { registerAllFeatures } from "../src/features/index.js";
import { hashPhone } from "../src/utils/crypto.js";
import { getFakeDbState, makeAgentDeps } from "./helpers.js";

describe("feature request capture", () => {
  it("queues a feature request with hashed requester identity and selected surface", async () => {
    const deps = makeAgentDeps();
    const tool = registerAllFeatures({ surface: "whatsapp" }).get("request_feature");

    const result = await tool?.handler(
      {
        description: "Add a home page voice capture shortcut. Success: one tap records and fills the chat input.",
        size: "S",
      },
      {
        deps,
        userPhone: "+61430008008",
        now: deps.now(),
        timezone: deps.timezone,
      },
    );

    const rows = getFakeDbState(deps.db).feature_requests;
    expect(result).toMatchObject({ status: "pending", size: "S" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      description: "Add a home page voice capture shortcut. Success: one tap records and fills the chat input.",
      type: "feature",
      size: "S",
      source: "whatsapp",
      requestedBy: hashPhone("+61430008008"),
    });
    expect(JSON.stringify(rows)).not.toContain("+61430008008");
  });

  it("defaults feature size to medium for messy human requests", async () => {
    const deps = makeAgentDeps();
    const tool = registerAllFeatures({ surface: "dashboard" }).get("request_feature");

    const result = await tool?.handler(
      { description: "Make the dashboard explain what each command button actually does." },
      {
        deps,
        userPhone: "+61430008008",
        now: deps.now(),
        timezone: deps.timezone,
      },
    );

    expect(result).toMatchObject({ status: "pending", size: "M" });
    expect(getFakeDbState(deps.db).feature_requests[0]).toMatchObject({
      source: "dashboard",
      size: "M",
    });
  });

  it("reads live feature queue status before answering queue questions", async () => {
    const deps = makeAgentDeps();
    const state = getFakeDbState(deps.db);
    state.feature_requests.push(
      {
        id: "11111111-1111-4111-8111-111111111111",
        description: "Connect Google Photos safely",
        type: "feature",
        size: "M",
        status: "pending",
        source: "whatsapp",
        createdAt: new Date("2026-05-08T10:00:00Z"),
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        description: "Expand safe integration request router",
        type: "feature",
        size: "M",
        status: "done",
        source: "whatsapp",
        createdAt: new Date("2026-05-08T09:00:00Z"),
        completedAt: new Date("2026-05-09T00:50:00Z"),
        implementationNotes: "Committed and tested.",
      },
    );
    const tool = registerAllFeatures({ surface: "whatsapp" }).get("list_feature_queue_status");

    const result = await tool?.handler(
      { limit: 3 },
      {
        deps,
        userPhone: "+61430008008",
        now: deps.now(),
        timezone: deps.timezone,
      },
    );

    expect(result).toMatchObject({
      pendingCount: 1,
      topPending: [
        {
          shortId: "11111111",
          description: "Connect Google Photos safely",
        },
      ],
      recentCompleted: [
        {
          shortId: "22222222",
          description: "Expand safe integration request router",
          implementationNotes: "Committed and tested.",
        },
      ],
    });
    expect(JSON.stringify(result)).toContain("Do not say 'nothing has shipped'");
  });
});
