import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAgentDeps, type BotConfigEnv } from "./adapters.js";

const baseEnv: BotConfigEnv = {
  ANTHROPIC_API_KEY: "anthropic-test-key",
  ANTHROPIC_MODEL: "claude-test",
  TRANSCRIPTION_MODEL: "whisper-test",
  TIMEZONE: "Australia/Melbourne",
};

function makeDeps(env: Partial<BotConfigEnv> = {}) {
  return buildAgentDeps({
    env: { ...baseEnv, ...env },
    db: {} as never,
    whatsapp: {} as never,
  });
}

describe("buildAgentDeps web search wiring", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the safe explanatory fallback when Serper is not configured", async () => {
    const deps = makeDeps();

    const results = await deps.webSearch.search("weather in Melbourne");

    expect(results[0]?.snippet).toContain("SERPER_API_KEY");
  });

  it("can disable web research explicitly", async () => {
    const deps = makeDeps({ ENABLE_WEB_RESEARCH: false, SERPER_API_KEY: "serper-test-key" });

    await expect(deps.webSearch.search("weather in Melbourne")).resolves.toEqual([]);
  });

  it("uses Serper when a key is configured", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        organic: [{ title: "Melbourne weather", link: "https://example.com/weather", snippet: "Warm." }],
      }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const deps = makeDeps({ SERPER_API_KEY: "serper-test-key" });

    const results = await deps.webSearch.search("weather in Melbourne");

    expect(fetchMock).toHaveBeenCalledWith("https://google.serper.dev/search", expect.objectContaining({
      headers: expect.objectContaining({ "X-API-KEY": "serper-test-key" }),
    }));
    expect(results).toEqual([
      { title: "Melbourne weather", url: "https://example.com/weather", snippet: "Warm." },
    ]);
  });
});
