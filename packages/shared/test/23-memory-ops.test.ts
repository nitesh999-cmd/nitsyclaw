import { describe, expect, it } from "vitest";
import {
  createAgentRunLog,
  createIncidentTimeline,
  createMemorySourceLink,
  createOpsSloSnapshot,
  detectStaleMemory,
  parseOneCommandCapture,
  parseSafeCommand,
  planJobRetryPolicy,
  planLiveSmokeSuite,
  rankPriorityItems,
  registerAllFeatures,
} from "../src/features/index.js";

describe("memory and ops batch 2 tools", () => {
  it("detects stale and historical memory", () => {
    const result = detectStaleMemory({
      now: "2026-05-06",
      facts: [
        { fact: "Current city is Sydney", lastConfirmed: "2026-04-01" },
        { fact: "Old office was in Richmond", lastConfirmed: "2025-01-01" },
        { fact: "Likes short replies", lastConfirmed: "2026-05-01" },
      ],
    });

    expect(result.review).toEqual(expect.arrayContaining([
      expect.objectContaining({ recommendation: "confirm", reason: "time-sensitive wording" }),
      expect.objectContaining({ recommendation: "expire" }),
      expect.objectContaining({ recommendation: "keep" }),
    ]));
  });

  it("creates source links for memories", () => {
    const result = createMemorySourceLink({
      fact: "Home city is Melbourne",
      sourceSurface: "whatsapp",
      sourceId: "msg_123",
      capturedAt: "2026-05-06",
    });

    expect(result.source).toBe("whatsapp:msg_123");
    expect(result.userControl).toContain("delete fact");
  });

  it("ranks priority items by impact, risk, due date, and age", () => {
    const result = rankPriorityItems({
      items: [
        { title: "Nice UI polish", impact: "low", risk: "low", dueInDays: 30 },
        { title: "WhatsApp loop bug", impact: "high", risk: "high", dueInDays: 0, ageDays: 2 },
      ],
    });

    expect(result.ranked[0].title).toBe("WhatsApp loop bug");
    expect(result.ranked[0].priority).toBe("P0");
  });

  it("classifies one-command captures", () => {
    expect(parseOneCommandCapture({ text: "bug: weather says Sydney when I am in Melbourne" }).kind).toBe("bug");
    expect(parseOneCommandCapture({ text: "Remind me tomorrow to call plumber" }).kind).toBe("reminder");
    expect(parseOneCommandCapture({ text: "Paid $24 for parking" }).kind).toBe("expense");
  });

  it("creates agent run logs with pass/fail status", () => {
    const passed = createAgentRunLog({
      goal: "Add feature",
      filesTouched: ["a.ts"],
      commandsRun: ["pnpm test"],
      verification: ["tests passed"],
      result: "done",
    });
    const failed = createAgentRunLog({ goal: "Deploy", errors: ["vercel failed"] });

    expect(passed.status).toBe("passed");
    expect(failed.status).toBe("failed");
  });

  it("plans retry policy without retrying auth or validation failures", () => {
    expect(planJobRetryPolicy({ job: "send brief", failureCategory: "network", attempts: 1 })).toMatchObject({
      retry: true,
      nextDelayMinutes: 10,
    });
    expect(planJobRetryPolicy({ job: "connect Gmail", failureCategory: "auth", attempts: 0 })).toMatchObject({
      retry: false,
      escalation: "P1",
    });
  });

  it("parses command risk before action", () => {
    const command = parseSafeCommand({ text: "Send this SMS to accountant on WhatsApp" });

    expect(command.intent).toBe("send");
    expect(command.channel).toBe("whatsapp");
    expect(command.risk).toBe("high");
    expect(command.requiresConfirmation).toBe(true);
  });

  it("creates ops SLO snapshots", () => {
    const result = createOpsSloSnapshot({
      dashboardOk: true,
      botFreshMinutes: 4,
      queueOldestHours: 2,
      apiLatencyMs: 900,
      failedToolRate: 0.01,
      liveSmokeOk: true,
    });

    expect(result.status).toBe("healthy");
    expect(result.score).toBe(100);
  });

  it("creates incident timelines with unverified recovery when missing proof", () => {
    const result = createIncidentTimeline({
      symptom: "WhatsApp loop",
      detectedAt: "9:00",
      surfaces: ["whatsapp"],
      actions: ["paused bot"],
    });

    expect(result.timeline).toContain("Action: paused bot.");
    expect(result.recoveryProof).toContain("UNVERIFIED");
  });

  it("plans safe live smoke checks", () => {
    const result = planLiveSmokeSuite({
      baseUrl: "https://nitsyclaw.vercel.app/",
      includeDestructiveDenial: true,
    });

    expect(result.baseUrl).toBe("https://nitsyclaw.vercel.app");
    expect(result.checks).toEqual(expect.arrayContaining([
      "POST https://nitsyclaw.vercel.app/api/data/delete without proof is denied.",
    ]));
  });

  it("registers all 10 batch tools", () => {
    const registry = registerAllFeatures({ surface: "dashboard" });

    for (const name of [
      "detect_stale_memory",
      "create_memory_source_link",
      "rank_priority_items",
      "parse_one_command_capture",
      "create_agent_run_log",
      "plan_job_retry_policy",
      "parse_safe_command",
      "create_ops_slo_snapshot",
      "create_incident_timeline",
      "plan_live_smoke_suite",
    ]) {
      expect(registry.get(name), name).toBeTruthy();
    }
  });
});
