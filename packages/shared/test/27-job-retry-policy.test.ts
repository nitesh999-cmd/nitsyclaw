import { describe, expect, it } from "vitest";
import {
  classifyJobFailure,
  planJobRetryPolicy,
} from "../src/ops/job-retry-policy.js";

describe("job retry policy", () => {
  it("classifies common operator failure categories", () => {
    expect(classifyJobFailure(new Error("OpenAI 429 rate limit"))).toBe("rate_limit");
    expect(classifyJobFailure(new Error("OAuth token expired"))).toBe("auth");
    expect(classifyJobFailure(new Error("fetch failed: ECONNRESET"))).toBe("network");
    expect(classifyJobFailure(new Error("request timed out"))).toBe("timeout");
    expect(classifyJobFailure(new Error("invalid input: missing amount"))).toBe("validation");
  });

  it("retries transient failures with bounded backoff", () => {
    const policy = planJobRetryPolicy({
      error: new Error("temporary provider outage"),
      attempts: 1,
      maxAttempts: 3,
      now: new Date("2026-05-31T00:00:00Z"),
    });

    expect(policy).toMatchObject({
      category: "network",
      retry: true,
      escalation: "none",
      nextDelayMs: 5 * 60_000,
    });
    expect(policy.nextRunAt?.toISOString()).toBe("2026-05-31T00:05:00.000Z");
  });

  it("does not retry auth or validation failures", () => {
    expect(planJobRetryPolicy({
      error: new Error("401 invalid token"),
      attempts: 1,
      maxAttempts: 3,
    })).toMatchObject({ category: "auth", retry: false, escalation: "P1" });
    expect(planJobRetryPolicy({
      error: new Error("bad request invalid input"),
      attempts: 1,
      maxAttempts: 3,
    })).toMatchObject({ category: "validation", retry: false, escalation: "P1" });
  });

  it("escalates after the retry budget is exhausted", () => {
    const policy = planJobRetryPolicy({
      error: new Error("unknown worker crashed"),
      attempts: 3,
      maxAttempts: 3,
    });

    expect(policy).toMatchObject({
      category: "unknown",
      retry: false,
      escalation: "P0",
      reason: "retry budget exhausted",
    });
  });
});
