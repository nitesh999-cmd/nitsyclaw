import {
  runBoundedJsonProcess,
  type BoundedJsonProcessResult,
} from "./qwen3-asr-process.js";

export const QWEN_UTF8_ENVIRONMENT_CONTROLS = Object.freeze({
  PYTHONUTF8: "1" as const,
  PYTHONIOENCODING: "utf-8" as const,
});

export const QWEN_PARENT_DECODER_CONTRACT = Object.freeze({
  encoding: "utf-8" as const,
  fatal: true as const,
});

type BoundedJsonProcessInput = Parameters<typeof runBoundedJsonProcess>[0];

let activeUtf8Run = false;

function restoreEnvironment(name: keyof typeof QWEN_UTF8_ENVIRONMENT_CONTROLS, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

export async function runBoundedUtf8JsonProcess(
  input: BoundedJsonProcessInput,
): Promise<BoundedJsonProcessResult> {
  if (activeUtf8Run) throw new Error("A bounded UTF-8 Qwen child is already active.");
  activeUtf8Run = true;
  const previousPythonUtf8 = process.env.PYTHONUTF8;
  const previousPythonIoEncoding = process.env.PYTHONIOENCODING;
  process.env.PYTHONUTF8 = QWEN_UTF8_ENVIRONMENT_CONTROLS.PYTHONUTF8;
  process.env.PYTHONIOENCODING = QWEN_UTF8_ENVIRONMENT_CONTROLS.PYTHONIOENCODING;
  try {
    return await runBoundedJsonProcess(input);
  } finally {
    restoreEnvironment("PYTHONUTF8", previousPythonUtf8);
    restoreEnvironment("PYTHONIOENCODING", previousPythonIoEncoding);
    activeUtf8Run = false;
  }
}
