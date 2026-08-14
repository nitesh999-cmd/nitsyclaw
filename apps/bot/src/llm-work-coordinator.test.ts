import { describe, expect, it, vi } from "vitest";
import type { LlmClient } from "@nitsyclaw/shared/agent";
import { createLlmWorkCoordinator } from "./llm-work-coordinator.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("LLM work coordinator", () => {
  it("skips scheduled background work while an accepted WhatsApp model call is active", async () => {
    const foreground = deferred<{ text: string }>();
    const inner: LlmClient = {
      complete: vi.fn(() => foreground.promise),
      toolStep: vi.fn(async () => ({ stopReason: "end_turn", toolCalls: [], text: "ok" })),
    };
    const coordinator = createLlmWorkCoordinator(inner);

    const activeCall = coordinator.interactive.complete({ system: "private", messages: [] });
    await Promise.resolve();

    const background = await coordinator.runBackground(async () => "should-not-run");
    expect(background).toEqual({ status: "busy" });

    foreground.resolve({ text: "visible answer" });
    await expect(activeCall).resolves.toEqual({ text: "visible answer" });
  });

  it("queues an interactive request that arrives during background work instead of overlapping", async () => {
    const background = deferred<string>();
    let concurrentCalls = 0;
    let maxConcurrentCalls = 0;
    const inner: LlmClient = {
      complete: vi.fn(async () => {
        concurrentCalls += 1;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
        concurrentCalls -= 1;
        return { text: "foreground" };
      }),
      toolStep: vi.fn(async () => ({ stopReason: "end_turn", toolCalls: [], text: "ok" })),
    };
    const coordinator = createLlmWorkCoordinator(inner);

    const backgroundRun = coordinator.runBackground(async () => {
      concurrentCalls += 1;
      maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
      const value = await background.promise;
      concurrentCalls -= 1;
      return value;
    });
    await Promise.resolve();
    const foregroundRun = coordinator.interactive.complete({ system: "", messages: [] });

    expect(coordinator.state()).toEqual({ active: "background", waitingInteractive: 1 });
    background.resolve("indexed");

    await expect(backgroundRun).resolves.toEqual({ status: "completed", value: "indexed" });
    await expect(foregroundRun).resolves.toEqual({ text: "foreground" });
    expect(maxConcurrentCalls).toBe(1);
  });
});
