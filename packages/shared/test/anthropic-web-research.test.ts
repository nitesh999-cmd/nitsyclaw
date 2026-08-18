import { describe, expect, it, vi } from "vitest";
import {
  makeAnthropicWebResearcher,
  mapRequestError,
  toWebSearcher,
  type MessageCreateLike,
} from "../src/search/anthropic-web-research.js";

const ENCRYPTED = "EqgfCioIARgBIiQ3YTAwMjY1Mi1mZjM5LTQ1NGUtODgxNC1kNjNjNTk1ZWI3Y";

function okResponse(text = "Talks resumed this morning.") {
  return {
    stop_reason: "end_turn",
    content: [
      { type: "server_tool_use", id: "srvtoolu_01", name: "web_search", input: { query: "world news" } },
      {
        type: "web_search_tool_result",
        tool_use_id: "srvtoolu_01",
        content: [
          {
            type: "web_search_result",
            url: "https://news.example.com/story",
            title: "Example headline",
            encrypted_content: ENCRYPTED,
          },
        ],
      },
      { type: "text", text },
    ],
  };
}

function researcher(create: MessageCreateLike, maxUses?: number) {
  return makeAnthropicWebResearcher({
    model: "claude-sonnet-4-6",
    create,
    maxUses,
    now: () => new Date("2026-07-28T02:00:00Z"),
  });
}

describe("makeAnthropicWebResearcher", () => {
  it("sends the pinned web search tool with a bounded max_uses", async () => {
    const create = vi.fn(async () => okResponse());

    await researcher(create).research({ query: "today's world news" });

    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0]![0];
    expect(params.tools).toEqual([{ type: "web_search_20250305", name: "web_search", max_uses: 5 }]);
    expect(params.model).toBe("claude-sonnet-4-6");
  });

  it("clamps max_uses into a safe range so search charges stay bounded", async () => {
    const create = vi.fn(async () => okResponse());

    await researcher(create, 500).research({ query: "news" });
    expect(create.mock.calls[0]![0].tools).toEqual([
      { type: "web_search_20250305", name: "web_search", max_uses: 10 },
    ]);

    create.mockClear();
    await researcher(create, 0).research({ query: "news" });
    expect(create.mock.calls[0]![0].tools).toEqual([
      { type: "web_search_20250305", name: "web_search", max_uses: 1 },
    ]);
  });

  it("spends a smaller per-call allowance when the turn budget hands one down", async () => {
    const create = vi.fn(async () => okResponse());

    await researcher(create).research({ query: "news", maxUses: 2 });

    expect(create.mock.calls[0]![0].tools).toEqual([
      { type: "web_search_20250305", name: "web_search", max_uses: 2 },
    ]);
  });

  it("never lets a per-call allowance raise the configured ceiling", async () => {
    const create = vi.fn(async () => okResponse());

    await researcher(create, 3).research({ query: "news", maxUses: 99 });

    expect(create.mock.calls[0]![0].tools).toEqual([
      { type: "web_search_20250305", name: "web_search", max_uses: 3 },
    ]);
  });

  it("never asks for confirmation and never mentions a training cutoff in its instructions", async () => {
    const create = vi.fn(async () => okResponse());

    await researcher(create).research({ query: "today's news" });

    const system = create.mock.calls[0]![0].system;
    expect(system).toContain("Never ask the user whether you should search");
    expect(system).toContain("Never mention a training cutoff");
  });

  it("continues a paused turn by sending the assistant message back unchanged", async () => {
    const paused = {
      stop_reason: "pause_turn",
      content: [
        { type: "server_tool_use", id: "srvtoolu_01", name: "web_search", input: { query: "news" } },
        {
          type: "web_search_tool_result",
          tool_use_id: "srvtoolu_01",
          content: [
            { type: "web_search_result", url: "https://a.example.com", title: "A", encrypted_content: ENCRYPTED },
          ],
        },
      ],
    };
    const create = vi.fn<MessageCreateLike>();
    create.mockResolvedValueOnce(paused);
    create.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Final answer." }],
    });

    const result = await researcher(create).research({ query: "today's news" });

    expect(create).toHaveBeenCalledTimes(2);
    const secondMessages = create.mock.calls[1]![0].messages;
    expect(secondMessages).toHaveLength(2);
    expect(secondMessages[1]).toEqual({ role: "assistant", content: paused.content });
    expect(result.status).toBe("ok");
    expect(result.answer).toBe("Final answer.");
    expect(result.sources).toEqual([{ title: "A", url: "https://a.example.com" }]);
  });

  it("stops after a bounded number of pause_turn continuations", async () => {
    const create = vi.fn<MessageCreateLike>(async () => ({
      stop_reason: "pause_turn",
      content: [
        { type: "server_tool_use", name: "web_search", input: {} },
        { type: "text", text: "partial " },
      ],
    }));

    await researcher(create).research({ query: "news" });

    expect(create).toHaveBeenCalledTimes(3);
  });

  it("reports a server tool error without inventing an answer", async () => {
    const create = vi.fn<MessageCreateLike>(async () => ({
      stop_reason: "end_turn",
      content: [
        { type: "server_tool_use", name: "web_search", input: {} },
        {
          type: "web_search_tool_result",
          tool_use_id: "x",
          content: { type: "web_search_tool_result_error", error_code: "too_many_requests" },
        },
        { type: "text", text: "As of my last update, ..." },
      ],
    }));

    const result = await researcher(create).research({ query: "news" });

    expect(result).toMatchObject({ status: "unavailable", failureCode: "rate_limited", answer: "" });
  });

  it("maps a transport failure to a non-secret code and keeps the message internal", async () => {
    const create = vi.fn<MessageCreateLike>(async () => {
      throw Object.assign(new Error("400 web search is not enabled for this organization req_abc123"), { status: 400 });
    });

    const instance = researcher(create);
    const result = await instance.research({ query: "news" });

    expect(result.status).toBe("unavailable");
    expect(result.failureCode).toBe("provider_disabled");
    expect(JSON.stringify(result)).not.toContain("req_abc123");
    expect(JSON.stringify(instance.health())).not.toContain("req_abc123");
  });

  it("rejects an empty query without calling the API", async () => {
    const create = vi.fn<MessageCreateLike>();

    const result = await researcher(create).research({ query: "   " });

    expect(create).not.toHaveBeenCalled();
    expect(result.failureCode).toBe("query_rejected");
  });

  it("exposes a non-secret health signal that tracks the last outcome", async () => {
    const create = vi.fn<MessageCreateLike>();
    const instance = researcher(create);

    expect(instance.health()).toEqual({
      state: "configured",
      provider: "anthropic-web-search",
      toolVersion: "web_search_20250305",
      maxUses: 5,
    });

    create.mockResolvedValueOnce(okResponse());
    await instance.research({ query: "news" });
    expect(instance.health()).toMatchObject({ state: "operational", lastCheckedAt: "2026-07-28T02:00:00.000Z" });

    create.mockRejectedValueOnce(Object.assign(new Error("boom"), { status: 429 }));
    await instance.research({ query: "news" });
    expect(instance.health()).toMatchObject({ state: "unavailable", lastFailureCode: "rate_limited" });
  });

  it("never leaks encrypted search content into its result", async () => {
    const create = vi.fn<MessageCreateLike>(async () => okResponse());

    const result = await researcher(create).research({ query: "news" });

    expect(JSON.stringify(result)).not.toContain(ENCRYPTED);
  });
});

describe("mapRequestError", () => {
  it("maps provider failures to non-secret codes", () => {
    expect(mapRequestError(Object.assign(new Error("x"), { status: 429 }))).toBe("rate_limited");
    expect(mapRequestError(Object.assign(new Error("x"), { status: 401 }))).toBe("provider_disabled");
    expect(mapRequestError(Object.assign(new Error("x"), { status: 404 }))).toBe("unsupported_model");
    expect(mapRequestError(Object.assign(new Error("bad query"), { status: 400 }))).toBe("query_rejected");
    expect(
      mapRequestError(Object.assign(new Error("web_search is not supported by this model"), { status: 400 })),
    ).toBe("unsupported_model");
    expect(mapRequestError(new Error("socket hang up"))).toBe("request_failed");
  });
});

describe("toWebSearcher", () => {
  it("maps a successful research result onto the legacy WebSearcher shape", async () => {
    const create = vi.fn<MessageCreateLike>(async () => okResponse("22 degrees and clear."));

    const results = await toWebSearcher(researcher(create)).search("weather today Melbourne");

    expect(results[0]).toEqual({
      title: "Example headline",
      url: "https://news.example.com/story",
      snippet: "22 degrees and clear.",
    });
  });

  it("returns an empty list when research is unavailable, so callers omit the section", async () => {
    const create = vi.fn<MessageCreateLike>(async () => {
      throw Object.assign(new Error("nope"), { status: 429 });
    });

    await expect(toWebSearcher(researcher(create)).search("weather")).resolves.toEqual([]);
  });
});
