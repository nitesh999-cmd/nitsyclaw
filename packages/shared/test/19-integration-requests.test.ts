import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/agent/tools.js";
import { registerIntegrationRequests } from "../src/features/19-integration-requests.js";
import { makeAgentDeps, makeFakeDb } from "./helpers.js";

const NOW = new Date("2026-05-04T00:00:00.000Z");

describe("integration request rails", () => {
  function setup() {
    const { db, state } = makeFakeDb();
    const deps = makeAgentDeps({ db, now: () => NOW });
    const ctx = {
      userPhone: "+61430008008",
      now: NOW,
      timezone: "Australia/Melbourne",
      deps,
    };
    const registry = new ToolRegistry();
    registerIntegrationRequests(registry);
    return { registry, ctx, state };
  }

  it("registers safe request tools without sending or scanning tools", () => {
    const { registry } = setup();
    const names = registry.all().map((tool) => tool.name);

    expect(names).toEqual([
      "queue_storage_file_import_request",
      "queue_google_photos_import_request",
      "prepare_sms_draft",
      "queue_phone_call_request",
      "queue_bank_csv_import_request",
      "queue_birthday_import_request",
      "queue_social_video_analysis_request",
    ]);
    expect(names).not.toContain("send_sms");
    expect(names).not.toContain("scan_drive");
    expect(names).not.toContain("sync_bank_feed");
  });

  it("queues Drive/OneDrive selected-file import requests as feature requests", async () => {
    const { registry, ctx, state } = setup();
    const tool = registry.get("queue_storage_file_import_request")!;

    const out = await tool.handler(
      { provider: "google_drive", fileNameOrLink: "https://drive.example/file", goal: "Summarize the proposal" },
      ctx,
    );

    expect(out).toMatchObject({ queued: true, status: "pending" });
    expect(state.feature_requests[0]).toMatchObject({
      type: "feature",
      size: "M",
      source: "whatsapp",
    });
    expect(state.feature_requests[0].description).toContain("google_drive selected-file import request");
  });

  it("prepares SMS copy without queueing or sending", async () => {
    const { registry, ctx, state } = setup();
    const tool = registry.get("prepare_sms_draft")!;

    const out = await tool.handler(
      { recipient: "Sam", body: "Running 5 minutes late", purpose: "Appointment update" },
      ctx,
    );

    expect(out).toMatchObject({
      prepared: true,
      recipient: "Sam",
      body: "Running 5 minutes late",
    });
    expect((out as { instruction: string }).instruction).toContain("has not sent it");
    expect(state.feature_requests).toHaveLength(0);
  });

  it("queues bank, birthday, and social video requests with safe wording", async () => {
    const { registry, ctx, state } = setup();

    await registry.get("queue_bank_csv_import_request")!.handler(
      { bankOrCard: "CBA", formatHint: "CSV", goal: "Categorise expenses" },
      ctx,
    );
    await registry.get("queue_birthday_import_request")!.handler(
      { source: "csv", goal: "Draft birthday messages" },
      ctx,
    );
    await registry.get("queue_social_video_analysis_request")!.handler(
      { platform: "instagram", urlOrUploadHint: "public reel link", goal: "Find hook ideas" },
      ctx,
    );

    expect(state.feature_requests).toHaveLength(3);
    expect(state.feature_requests.map((row) => row.implementationNotes)).toEqual([
      "Queued through safe integration request rail; no live external access was claimed.",
      "Queued through safe integration request rail; no live external access was claimed.",
      "Queued through safe integration request rail; no live external access was claimed.",
    ]);
  });
});
