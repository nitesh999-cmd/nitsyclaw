import type {
  BackgroundLlmJobResult,
  LlmClient,
} from "@nitsyclaw/shared/agent";

export interface LlmWorkCoordinator {
  interactive: LlmClient;
  runBackground<T>(job: (llm: LlmClient) => Promise<T>): Promise<BackgroundLlmJobResult<T>>;
  state(): { active: "interactive" | "background" | null; waitingInteractive: number };
}

/**
 * Ollama serves one NitsyClaw model job at a time on the owner laptop.
 * Interactive calls queue; background work only starts while the model is
 * idle. If a user arrives during background work, their call waits rather
 * than opening a competing request that can make both calls time out.
 */
export function createLlmWorkCoordinator(inner: LlmClient): LlmWorkCoordinator {
  let active: "interactive" | "background" | null = null;
  const interactiveWaiters: Array<() => void> = [];

  const acquireInteractive = async (): Promise<void> => {
    if (active === null) {
      active = "interactive";
      return;
    }
    await new Promise<void>((resolve) => interactiveWaiters.push(resolve));
  };

  const release = (): void => {
    const next = interactiveWaiters.shift();
    if (next) {
      active = "interactive";
      next();
      return;
    }
    active = null;
  };

  const runInteractive = async <T>(job: () => Promise<T>): Promise<T> => {
    await acquireInteractive();
    try {
      return await job();
    } finally {
      release();
    }
  };

  const interactive: LlmClient = {
    complete: (args) => runInteractive(() => inner.complete(args)),
    toolStep: (args) => runInteractive(() => inner.toolStep(args)),
  };

  return {
    interactive,
    async runBackground<T>(job: (llm: LlmClient) => Promise<T>): Promise<BackgroundLlmJobResult<T>> {
      if (active !== null || interactiveWaiters.length > 0) return { status: "busy" };
      active = "background";
      try {
        return { status: "completed", value: await job(inner) };
      } finally {
        release();
      }
    },
    state: () => ({ active, waitingInteractive: interactiveWaiters.length }),
  };
}
