import { spawn } from "node:child_process";

const DEFAULT_OUTPUT_LIMIT = 256 * 1024;

export type BoundedJsonProcessResult = {
  exitCode: number | null;
  elapsedMs: number;
  stdout: string;
  stderr: string;
  payload: Record<string, unknown>;
};

export function parseSingleJsonObject(stdout: string): Record<string, unknown> {
  const normalized = stdout.trim();
  if (!normalized) throw new Error("Local evaluator returned no JSON result.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new Error("Local evaluator returned partial or invalid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Local evaluator JSON result must be one object.");
  }
  return parsed as Record<string, unknown>;
}

export function runBoundedJsonProcess(input: {
  executable: string;
  args: string[];
  timeoutMs: number;
  outputLimitBytes?: number;
  signal?: AbortSignal;
}): Promise<BoundedJsonProcessResult> {
  return new Promise((resolvePromise, reject) => {
    const started = performance.now();
    // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- callers realpath-review the executable and script; shell is disabled and the environment is forced offline.
    const child = spawn(input.executable, input.args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ALL_PROXY: "http://127.0.0.1:9",
        DO_NOT_TRACK: "1",
        GRADIO_ANALYTICS_ENABLED: "False",
        HF_HUB_DISABLE_TELEMETRY: "1",
        HF_HUB_OFFLINE: "1",
        HTTPS_PROXY: "http://127.0.0.1:9",
        HTTP_PROXY: "http://127.0.0.1:9",
        NO_PROXY: "",
        PYTHONHASHSEED: "0",
        TOKENIZERS_PARALLELISM: "false",
        TRANSFORMERS_OFFLINE: "1",
      },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const outputLimit = input.outputLimitBytes ?? DEFAULT_OUTPUT_LIMIT;
    let outputBytes = 0;
    let forcedError: Error | undefined;
    let settled = false;

    const abort = (error: Error) => {
      if (forcedError) return;
      forcedError = error;
      child.kill();
    };
    const collect = (target: Buffer[], chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > outputLimit) {
        abort(new Error("Local evaluator exceeded its bounded output limit."));
        return;
      }
      target.push(Buffer.from(chunk));
    };
    const onAbort = () => abort(new Error("Local evaluator was cancelled."));
    if (input.signal?.aborted) onAbort();
    else input.signal?.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(
      () => abort(new Error("Local evaluator exceeded its bounded deadline.")),
      input.timeoutMs,
    );
    timer.unref?.();
    child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));
    child.once("error", () => abort(new Error("Local evaluator could not start.")));
    child.once("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", onAbort);
      if (forcedError) {
        reject(forcedError);
        return;
      }
      const rawStdout = Buffer.concat(stdout).toString("utf8");
      try {
        resolvePromise({
          exitCode,
          elapsedMs: Math.round(performance.now() - started),
          stdout: rawStdout,
          stderr: Buffer.concat(stderr).toString("utf8"),
          payload: parseSingleJsonObject(rawStdout),
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}
