import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, setFeatureRequestStatus } from "@nitsyclaw/shared/db";
import { POST } from "./route";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("@nitsyclaw/shared/db", () => ({
  getDb: vi.fn(() => ({ mocked: true })),
  setFeatureRequestStatus: vi.fn(),
}));

function sameOriginRequest(body: BodyInit, contentType: string): Request {
  return new Request("https://nitsyclaw.vercel.app/api/queue/update", {
    method: "POST",
    headers: {
      origin: "https://nitsyclaw.vercel.app",
      "content-type": contentType,
    },
    body,
  });
}

describe("queue update route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects malformed form bodies without a 500", async () => {
    const response = await POST(sameOriginRequest("not multipart", "multipart/form-data; boundary=x"));

    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects invalid ids with no-store", async () => {
    const response = await POST(sameOriginRequest(
      new URLSearchParams({ id: "not-a-uuid", status: "done", expectedStatus: "pending" }),
      "application/x-www-form-urlencoded",
    ));

    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(setFeatureRequestStatus).not.toHaveBeenCalled();
  });

  it("does not report success when the queue item is missing", async () => {
    vi.mocked(setFeatureRequestStatus).mockResolvedValueOnce(false);

    const response = await POST(sameOriginRequest(
      new URLSearchParams({
        id: "11111111-1111-4111-8111-111111111111",
        status: "done",
        expectedStatus: "pending",
      }),
      "application/x-www-form-urlencoded",
    ));

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(getDb).toHaveBeenCalledOnce();
  });

  it("requires expected status to prevent stale queue updates", async () => {
    const response = await POST(sameOriginRequest(
      new URLSearchParams({
        id: "11111111-1111-4111-8111-111111111111",
        status: "done",
      }),
      "application/x-www-form-urlencoded",
    ));

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Invalid expected queue status");
    expect(setFeatureRequestStatus).not.toHaveBeenCalled();
  });
});
