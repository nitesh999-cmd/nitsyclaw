import { describe, expect, it } from "vitest";
import {
  assessMemoryQuality,
  formatMemoryQualityLabel,
  mergeMemoryQualityTags,
} from "./memory-quality.js";

describe("memory quality controls", () => {
  it("keeps stable facts explicit and stable", () => {
    const assessment = assessMemoryQuality("My passport is in the top drawer");

    expect(assessment.category).toBe("sensitive");
    expect(assessment.confidence).toBe("explicit");
    expect(assessment.action).toBe("review");
    expect(assessment.tags).toContain("quality:sensitive");
    expect(formatMemoryQualityLabel("My passport is in the top drawer")).toContain("sensitive");
  });

  it("marks guesses as uncertain review items", () => {
    const assessment = assessMemoryQuality("I think John prefers SMS, but not sure");

    expect(assessment.category).toBe("guess");
    expect(assessment.confidence).toBe("uncertain");
    expect(assessment.action).toBe("review");
    expect(assessment.tags).toContain("confidence:uncertain");
  });

  it("marks travel/current-location memory as temporary with review expiry", () => {
    const assessment = assessMemoryQuality("I am travelling in Sydney this week", ["travel"]);

    expect(assessment.category).toBe("temporary_context");
    expect(assessment.action).toBe("expire");
    expect(assessment.reviewAfterDays).toBe(7);
    expect(assessment.reasons.join(" ")).toContain("temporary");
  });

  it("merges quality tags without duplicating stale previous quality tags", () => {
    const tags = mergeMemoryQualityTags("Default currency is AUD", ["finance", "quality:guess", "memory:review"]);

    expect(tags).toContain("finance");
    expect(tags).toContain("quality:preference");
    expect(tags).toContain("memory:stable");
    expect(tags).not.toContain("quality:guess");
  });
});
