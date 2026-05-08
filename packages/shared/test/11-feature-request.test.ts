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
});
