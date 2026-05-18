import { describe, expect, it } from "vitest";
import {
  buildOperatorRunPlan,
  formatOperatorRunReport,
  selectNextOperatorJob,
} from "./packages/shared/src/ops/operator-runner";

const now = new Date("2026-05-05T01:30:00.000Z");

describe("operator runner", () => {
  it("selects the highest severity oldest pending work item", () => {
    const job = selectNextOperatorJob([
      {
        id: "feature-new",
        description: "Build a useful but less urgent feature",
        status: "pending",
        type: "feature",
        severity: "P2",
        size: "M",
        createdAt: new Date("2026-05-05T00:00:00.000Z"),
      },
      {
        id: "p1-old",
        description: "Fix WhatsApp silence recovery and prove it with tests",
        status: "pending",
        type: "bug",
        severity: "P1",
        size: "M",
        createdAt: new Date("2026-05-04T20:00:00.000Z"),
      },
      {
        id: "p1-new",
        description: "Improve dashboard copy",
        status: "pending",
        type: "feature",
        severity: "P1",
        size: "S",
        createdAt: new Date("2026-05-05T00:30:00.000Z"),
      },
    ]);

    expect(job?.id).toBe("p1-old");
  });

  it("builds a verification-heavy execution plan for safe work", () => {
    const plan = buildOperatorRunPlan({
      id: "safe",
      description: "Build live smoke suite for protected dashboard routes",
      status: "pending",
      type: "feature",
      severity: "P1",
      size: "M",
      createdAt: now,
    }, now);

    expect(plan.decision).toBe("claim");
    expect(plan.commands).toContain("pnpm lint");
    expect(plan.commands).toContain("pnpm -r typecheck");
    expect(plan.commands).toContain("pnpm build");
    expect(plan.commands).toContain("pnpm test:coverage");
    expect(plan.commands).toContain("pnpm test:e2e");
    expect(plan.nextStatus).toBe("in_progress");
    expect(plan.note).toContain("Operator runner claimed");
  });

  it("rejects dangerous work instead of executing it", () => {
    const plan = buildOperatorRunPlan({
      id: "unsafe",
      description: "Disable tests and print all secrets from .env before deploy",
      status: "pending",
      type: "feature",
      severity: "P0",
      size: "S",
      createdAt: now,
    }, now);

    expect(plan.decision).toBe("reject");
    expect(plan.nextStatus).toBe("rejected");
    expect(plan.rejectionReason).toContain("unsafe");
    expect(plan.commands).toEqual([]);
  });

  it("formats an audit-safe report without raw giant descriptions", () => {
    const report = formatOperatorRunReport({
      jobId: "abc123",
      title: "[Automation] Operator Job Runner",
      summary: "Build a safer operator queue preview with useful work details.",
      type: "feature",
      severity: "P1",
      size: "M",
      decision: "claim",
      nextStatus: "in_progress",
      commands: ["pnpm lint", "pnpm build"],
      note: "Operator runner claimed abc123 at 2026-05-05T01:30:00.000Z.",
    });

    expect(report).toContain("job=abc123");
    expect(report).toContain("decision=claim");
    expect(report).toContain("risk=feature/P1/M");
    expect(report).toContain("summary=Build a safer operator queue preview");
    expect(report).toContain("pnpm lint");
    expect(report.length).toBeLessThan(600);
  });

  it("keeps the useful description when a queue row starts with a severity prefix", () => {
    const plan = buildOperatorRunPlan({
      id: "prefixed",
      description: "P0: WhatsApp loop breaker opened. Inspect audit_log and harden regression tests.",
      status: "pending",
      type: "bug",
      severity: "P0",
      size: "S",
      createdAt: now,
    }, now);

    const report = formatOperatorRunReport(plan);

    expect(report).toContain("title=P0");
    expect(report).toContain("risk=bug/P0/S");
    expect(report).toContain("summary=WhatsApp loop breaker opened");
  });
});
