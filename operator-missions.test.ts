import { describe, expect, it } from "vitest";
import {
  getOperatorMission,
  missionToQueueDescription,
  OPERATOR_MISSIONS,
} from "./apps/dashboard/src/app/command/operator-missions";

describe("operator missions", () => {
  it("defines exactly twenty high-leverage missions with stable ids", () => {
    expect(OPERATOR_MISSIONS).toHaveLength(20);
    const ids = new Set(OPERATOR_MISSIONS.map((mission) => mission.id));
    expect(ids.size).toBe(OPERATOR_MISSIONS.length);

    for (const mission of OPERATOR_MISSIONS) {
      expect(mission.id).toMatch(/^[a-z0-9-]+$/);
      expect(mission.title.length).toBeGreaterThan(8);
      expect(mission.description.length).toBeGreaterThan(80);
      expect(mission.outcome.length).toBeGreaterThan(30);
      expect(mission.description).not.toMatch(/todo|placeholder|implement here/i);
    }
  });

  it("turns missions into queue-ready work item descriptions", () => {
    const mission = getOperatorMission("self-healing-core");
    expect(mission).toBeTruthy();
    const description = missionToQueueDescription(mission!);
    expect(description).toContain("[Reliability] Self-Healing Core");
    expect(description).toContain("Outcome:");
  });
});

