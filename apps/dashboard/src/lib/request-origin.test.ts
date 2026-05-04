import { describe, expect, it } from "vitest";
import { isSameOriginRequest, requireSameOrigin } from "./request-origin";

describe("request origin guard", () => {
  it("accepts same-origin POST requests", () => {
    const request = new Request("https://nitsyclaw.vercel.app/api/data/delete", {
      method: "POST",
      headers: { origin: "https://nitsyclaw.vercel.app" },
    });

    expect(isSameOriginRequest(request)).toBe(true);
    expect(requireSameOrigin(request)).toBeNull();
  });

  it("rejects cross-origin POST requests", () => {
    const request = new Request("https://nitsyclaw.vercel.app/api/data/delete", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });

    const response = requireSameOrigin(request);

    expect(isSameOriginRequest(request)).toBe(false);
    expect(response?.status).toBe(403);
  });

  it("rejects missing origin and referer headers", () => {
    const request = new Request("https://nitsyclaw.vercel.app/api/data/delete", {
      method: "POST",
    });

    expect(requireSameOrigin(request)?.status).toBe(403);
  });

  it("falls back to same-origin referer when origin is unavailable", () => {
    const request = new Request("https://nitsyclaw.vercel.app/api/data/delete", {
      method: "POST",
      headers: { referer: "https://nitsyclaw.vercel.app/settings" },
    });

    expect(requireSameOrigin(request)).toBeNull();
  });
});
