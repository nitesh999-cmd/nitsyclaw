import { afterEach, describe, expect, it, vi } from "vitest";

import { formatNotifyFailure, pushNotify } from "./index.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe("notification error safety", () => {
  it("does not log ntfy response bodies", async () => {
    process.env.NTFY_TOPIC = "test-topic";
    delete process.env.WINDOWS_TOAST;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("private body for nitesh@example.com sk_live_secret123456", {
        status: 500,
        statusText: "Server Error",
      })),
    );

    await pushNotify("hello");

    expect(consoleError).toHaveBeenCalledWith("[notify/ntfy] failed status=500 Server Error");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("private body");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("nitesh@example.com");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("sk_live");
  });

  it("redacts exception details before logging notification failures", () => {
    const message = formatNotifyFailure(
      "toast",
      new Error("failed for nitesh@example.com +61 430 008 008 sk_live_secret123456"),
    );

    expect(message).toContain("[redacted:email]");
    expect(message).toContain("[redacted:phone]");
    expect(message).toContain("[redacted:token]");
    expect(message).not.toContain("nitesh@example.com");
    expect(message).not.toContain("+61 430 008 008");
    expect(message).not.toContain("sk_live");
  });
});
