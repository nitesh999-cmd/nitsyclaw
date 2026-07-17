import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const ORIGINAL_ENV = { ...process.env };

describe("dashboard chat route", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("does not require Anthropic when the local model route is available", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.WHATSAPP_OWNER_NUMBER = "+61430008008";
    delete process.env.DATABASE_URL;

    const response = await POST(new Request("https://nitsyclaw.vercel.app/api/chat", {
      method: "POST",
      headers: {
        origin: "https://nitsyclaw.vercel.app",
        "content-type": "application/json",
      },
      body: JSON.stringify({ history: [{ role: "user", content: "hello" }] }),
    }));
    const body = await response.json() as { reply: string };

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.reply).toBe("Dashboard database is not configured.");
    expect(body.reply).not.toContain("ANTHROPIC_API_KEY");
  });
});
