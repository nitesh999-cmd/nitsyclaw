import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("@nitsyclaw/shared/db", () => ({
  getDb: () => dbMock,
}));

import {
  clearDashboardLoginAttemptsForKeys,
  getDashboardLoginAttemptStates,
  resetDashboardLoginAttemptTableCacheForTests,
} from "./dashboard-login-attempts";

describe("dashboard login attempt storage", () => {
  beforeEach(() => {
    dbMock.execute.mockReset();
    dbMock.execute.mockResolvedValue([]);
    resetDashboardLoginAttemptTableCacheForTests();
  });

  it("loads and clears multiple login keys with minimal database round trips", async () => {
    await getDashboardLoginAttemptStates(["ip:203.0.113.10", "account:nitesh"], 1_000);
    await clearDashboardLoginAttemptsForKeys(["ip:203.0.113.10", "account:nitesh"]);

    expect(dbMock.execute).toHaveBeenCalledTimes(3);
  });
});
