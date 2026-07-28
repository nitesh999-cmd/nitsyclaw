import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAgentDeps, normalizeStopReason, type BotConfigEnv } from "./adapters.js";

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

describe("normalizeStopReason", () => {
  it("keeps the two stop reasons the agent loop acts on", () => {
    expect(normalizeStopReason("tool_use")).toBe("tool_use");
    expect(normalizeStopReason("max_tokens")).toBe("max_tokens");
  });

  it("ends the turn for pause_turn and any other stop reason", () => {
    // pause_turn only arises with server tools; it must never be mistaken for a
    // client tool call and re-enter the loop.
    expect(normalizeStopReason("pause_turn")).toBe("end_turn");
    expect(normalizeStopReason("refusal")).toBe("end_turn");
    expect(normalizeStopReason("stop_sequence")).toBe("end_turn");
    expect(normalizeStopReason(null)).toBe("end_turn");
    expect(normalizeStopReason(undefined)).toBe("end_turn");
  });
});

describe("buildAgentDeps web search wiring", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("wires Anthropic server-side web search from the existing Anthropic key", async () => {
    const deps = makeDeps();

    expect(deps.liveResearch).toBeDefined();
    expect(deps.liveResearch!.health()).toMatchObject({
      state: "configured",
      provider: "anthropic-web-search",
      toolVersion: "web_search_20250305",
      maxUses: 5,
    });
  });

  it("bounds server-side searches with the configured max_uses cap", () => {
    expect(makeDeps({ WEB_SEARCH_MAX_USES: 2 }).liveResearch!.maxUses).toBe(2);
  });

  it("reports live research unavailable, and returns no placeholder results, without an Anthropic key", async () => {
    const deps = makeDeps({ ANTHROPIC_API_KEY: undefined });

    const result = await deps.liveResearch!.research({ query: "today's news" });

    expect(result).toMatchObject({ status: "unavailable", failureCode: "not_configured", answer: "" });
    await expect(deps.webSearch.search("weather in Melbourne")).resolves.toEqual([]);
  });

  it("builds in local-only mode without an Anthropic key", async () => {
    const deps = makeDeps({ ANTHROPIC_API_KEY: undefined, NITSYCLAW_MODEL_MODE: "local_only" });
    expect(deps.llm).toBeDefined();
    await expect(deps.imageAnalyzer.extractReceipt(Buffer.from("image"), "image/jpeg"))
      .rejects.toThrow("ANTHROPIC_API_KEY");
  });

  it("can disable web research explicitly", async () => {
    const deps = makeDeps({ ENABLE_WEB_RESEARCH: false, SERPER_API_KEY: "serper-test-key" });

    await expect(deps.webSearch.search("weather in Melbourne")).resolves.toEqual([]);
    expect(deps.liveResearch!.health()).toMatchObject({
      state: "unavailable",
      lastFailureCode: "disabled_by_config",
    });
  });

  it("still uses a pre-existing Serper key when no Anthropic key is set", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        organic: [{ title: "Melbourne weather", link: "https://example.com/weather", snippet: "Warm." }],
      }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const deps = makeDeps({ ANTHROPIC_API_KEY: undefined, SERPER_API_KEY: "serper-test-key" });

    const results = await deps.webSearch.search("weather in Melbourne");

    expect(fetchMock).toHaveBeenCalledWith("https://google.serper.dev/search", expect.objectContaining({
      headers: expect.objectContaining({ "X-API-KEY": "serper-test-key" }),
    }));
    expect(results).toEqual([
      { title: "Melbourne weather", url: "https://example.com/weather", snippet: "Warm." },
    ]);
  });
});
