import { describe, expect, it } from "vitest";

import { formatWatchdogHeartbeatError } from "./watchdog-heartbeat.js";

describe("watchdog heartbeat error safety", () => {
  it("redacts secrets and contact data from heartbeat failures", () => {
    const message = formatWatchdogHeartbeatError(
      new Error(
        "connect failed postgres://user:pass@example.test/db for nitesh@example.com +61 430 008 008 sk_live_secret123456",
      ),
    );

    expect(message).toContain("[redacted:database-url]");
    expect(message).toContain("[redacted:email]");
    expect(message).toContain("[redacted:phone]");
    expect(message).toContain("[redacted:token]");
    expect(message).not.toContain("postgres://");
    expect(message).not.toContain("nitesh@example.com");
    expect(message).not.toContain("+61 430 008 008");
    expect(message).not.toContain("sk_live");
  });
});
