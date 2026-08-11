import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const adapterPath = fileURLToPath(new URL("./qwen3-asr-adapter.py", import.meta.url));

describe("Qwen3-ASR offline adapter safety", () => {
  it("pins the exact model, safetensor hashes, and code-loading controls", async () => {
    const source = await readFile(adapterPath, "utf8");
    expect(source).toContain('MODEL_REVISION = "7278e1e70fe206f11671096ffdd38061171dd6e5"');
    expect(source).toContain("a4cd1f1a04d90b757dc7f7dd26254e69a013b19e80efe590a83c6a3bde8608d6");
    expect(source).toContain("6e0b9d9e09e2e0238e7ef3cc8a484ab387e91b90f1900bedf88bc92d7929ccfc");
    expect(source).toContain("trust_remote_code=False");
    expect(source).toContain("local_files_only=True");
    expect(source).toContain('any(not item.endswith(".safetensors")');
  });

  it("blocks sockets before third-party imports and never manufactures confidence", async () => {
    const source = await readFile(adapterPath, "utf8");
    const socketBlock = source.indexOf("socket.socket.connect = _deny_network");
    const torchImport = source.indexOf("import torch as imported_torch");
    expect(socketBlock).toBeGreaterThan(0);
    expect(torchImport).toBeGreaterThan(socketBlock);
    expect(source).toContain('"providerConfidence": None');
    expect(source).toContain('"confidenceTelemetry": "unavailable"');
    expect(source).not.toContain("trust_remote_code=True");
  });

  it("has fail-closed OOM, malformed audio, timeout-compatible output, and cleanup paths", async () => {
    const source = await readFile(adapterPath, "utf8");
    expect(source).toContain('return "oom"');
    expect(source).toContain('return "device_placement"');
    expect(source).toContain('return "no_transcript"');
    expect(source).toContain('"schemaVersion": "NITSYCLAW-QWEN3-ASR-ADAPTER-V1.1"');
    expect(source).toContain('choices=("diagnostic", "scored")');
    expect(source).toContain('selected_cases = cases[:1] if args.mode == "diagnostic" else cases');
    expect(source).toContain('raise ValueError("audio is not a complete PCM WAV")');
    expect(source).toContain("torch.cuda.empty_cache()");
    expect(source).toContain('payload["cleanup"]');
    expect(source).toContain("return 0 if payload[\"status\"] == \"ok\" else 2");
  });

  it("persists a bounded redacted causal message without raw paths or tokens", async () => {
    const source = await readFile(adapterPath, "utf8");
    expect(source).toContain("MAX_ERROR_MESSAGE = 2_048");
    expect(source).toContain("_safe_error_message(error)");
    expect(source).toContain('"message": _safe_error_message(error)');
    expect(source).toContain('r"\\1=<redacted>"');
  });
});
