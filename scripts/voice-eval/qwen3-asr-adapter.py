"""Bounded, offline-only adapter for the pinned Qwen3-ASR 1.7B smoke evaluation."""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import os
import re
import socket
import sys
import time
import wave
from pathlib import Path
from typing import Any


MODEL_REVISION = "7278e1e70fe206f11671096ffdd38061171dd6e5"
MODEL_WEIGHT_HASHES = {
    "model-00001-of-00002.safetensors": "a4cd1f1a04d90b757dc7f7dd26254e69a013b19e80efe590a83c6a3bde8608d6",
    "model-00002-of-00002.safetensors": "6e0b9d9e09e2e0238e7ef3cc8a484ab387e91b90f1900bedf88bc92d7929ccfc",
}
CASE_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
MAX_AUDIO_BYTES = 16 * 1024 * 1024
MAX_AUDIO_SECONDS = 120


def _deny_network(*_args: Any, **_kwargs: Any) -> Any:
    raise OSError("NitsyClaw offline evaluation blocks all Python socket access")


# Apply before importing any third-party model or audio package.
socket.socket.connect = _deny_network  # type: ignore[method-assign]
socket.socket.connect_ex = _deny_network  # type: ignore[method-assign]
socket.create_connection = _deny_network  # type: ignore[assignment]
socket.getaddrinfo = _deny_network  # type: ignore[assignment]
os.environ.update(
    {
        "DO_NOT_TRACK": "1",
        "GRADIO_ANALYTICS_ENABLED": "False",
        "HF_HUB_DISABLE_TELEMETRY": "1",
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
    }
)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _inside(root: Path, candidate: Path) -> bool:
    try:
        candidate.relative_to(root)
        return True
    except ValueError:
        return False


def _validate_audio(root: Path, case_spec: str) -> tuple[str, Path]:
    case_id, separator, raw_path = case_spec.partition("=")
    if separator != "=" or not CASE_ID.fullmatch(case_id):
        raise ValueError("case must use the reviewed id=absolute-wav-path format")
    path = Path(raw_path)
    if not path.is_absolute():
        raise ValueError("audio path must be absolute")
    resolved = path.resolve(strict=True)
    if not _inside(root, resolved) or resolved.suffix.lower() != ".wav":
        raise ValueError("audio path escaped the private WAV-only evaluation root")
    size = resolved.stat().st_size
    if size <= 44 or size > MAX_AUDIO_BYTES:
        raise ValueError("audio size is outside the bounded evaluation limit")
    try:
        with wave.open(str(resolved), "rb") as wav:
            channels = wav.getnchannels()
            sample_width = wav.getsampwidth()
            sample_rate = wav.getframerate()
            frames = wav.getnframes()
            compression = wav.getcomptype()
    except (EOFError, wave.Error) as error:
        raise ValueError("audio is not a complete PCM WAV") from error
    if channels != 1 or sample_width != 2 or sample_rate != 16_000 or compression != "NONE":
        raise ValueError("audio must be mono 16-bit 16 kHz PCM WAV")
    if frames <= 0 or frames > sample_rate * MAX_AUDIO_SECONDS:
        raise ValueError("audio duration is outside the bounded evaluation limit")
    return case_id, resolved


def _validate_model(path: Path) -> dict[str, str]:
    resolved = path.resolve(strict=True)
    if not resolved.is_dir() or resolved.name != MODEL_REVISION:
        raise ValueError("model must be the pinned local Qwen3-ASR revision directory")
    config = json.loads((resolved / "config.json").read_text(encoding="utf-8"))
    if config.get("model_type") != "qwen3_asr" or config.get("auto_map") is not None:
        raise ValueError("model config is not the reviewed code-free Qwen3-ASR config")
    architectures = config.get("architectures")
    if architectures != ["Qwen3ASRForConditionalGeneration"]:
        raise ValueError("model architecture differs from the reviewed manifest")
    index = json.loads((resolved / "model.safetensors.index.json").read_text(encoding="utf-8"))
    referenced = set(index.get("weight_map", {}).values())
    if referenced != set(MODEL_WEIGHT_HASHES) or any(not item.endswith(".safetensors") for item in referenced):
        raise ValueError("model index referenced an unreviewed or unsafe weight file")
    observed: dict[str, str] = {}
    for name, expected in MODEL_WEIGHT_HASHES.items():
        actual = _sha256(resolved / name)
        if actual != expected:
            raise ValueError(f"model integrity check failed for {name}")
        observed[name] = actual
    return observed


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--audio-root", required=True)
    parser.add_argument("--case", action="append", required=True)
    parser.add_argument("--max-new-tokens", type=int, default=128)
    args = parser.parse_args()
    if args.max_new_tokens != 128:
        raise ValueError("max_new_tokens is frozen at 128")
    if len(args.case) != 2:
        raise ValueError("the bounded smoke requires exactly two cases")
    return args


def _peak_rss(process: Any) -> int:
    info = process.memory_info()
    return int(getattr(info, "peak_wset", info.rss))


def main() -> int:
    payload: dict[str, Any] = {
        "schemaVersion": "NITSYCLAW-QWEN3-ASR-ADAPTER-V1",
        "status": "error",
        "confidenceTelemetry": "unavailable",
        "providerConfidence": None,
        "networkPolicy": {
            "pythonSocketAccess": "denied-before-third-party-imports",
            "hfHubOffline": True,
            "transformersOffline": True,
            "kernelFirewallRule": False,
        },
    }
    model: Any = None
    torch: Any = None
    started = time.perf_counter()
    try:
        args = _arguments()
        audio_root = Path(args.audio_root).resolve(strict=True)
        if not audio_root.is_dir():
            raise ValueError("audio root must be a private local directory")
        cases = [_validate_audio(audio_root, item) for item in args.case]
        if len({case_id for case_id, _path in cases}) != len(cases):
            raise ValueError("case ids must be unique")
        model_path = Path(args.model_path)
        observed_hashes = _validate_model(model_path)

        import psutil
        import torch as imported_torch
        from qwen_asr import Qwen3ASRModel

        torch = imported_torch
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA is unavailable")
        torch.cuda.init()
        torch.cuda.reset_peak_memory_stats(0)
        load_started = time.perf_counter()
        model = Qwen3ASRModel.from_pretrained(
            str(model_path.resolve(strict=True)),
            dtype=torch.bfloat16,
            device_map="cuda:0",
            max_inference_batch_size=1,
            max_new_tokens=128,
            local_files_only=True,
            trust_remote_code=False,
        )
        torch.cuda.synchronize(0)
        load_ms = round((time.perf_counter() - load_started) * 1_000)
        results: list[dict[str, Any]] = []
        for case_id, audio_path in cases:
            case_started = time.perf_counter()
            transcription = model.transcribe(
                audio=str(audio_path),
                context="",
                language=None,
                return_time_stamps=False,
            )
            torch.cuda.synchronize(0)
            latency_ms = round((time.perf_counter() - case_started) * 1_000)
            if len(transcription) != 1 or not isinstance(transcription[0].text, str) or not transcription[0].text:
                raise RuntimeError("model returned no complete transcript")
            results.append(
                {
                    "caseId": case_id,
                    "rawTranscript": transcription[0].text,
                    "modelLanguage": transcription[0].language,
                    "providerConfidence": None,
                    "latencyMs": latency_ms,
                }
            )
        process = psutil.Process()
        payload.update(
            {
                "status": "ok",
                "modelRevision": MODEL_REVISION,
                "modelWeightSha256": observed_hashes,
                "backend": model.backend,
                "device": str(model.device),
                "dtype": str(model.dtype),
                "loadMs": load_ms,
                "cases": results,
                "resources": {
                    "processRssBytes": int(process.memory_info().rss),
                    "processPeakRssBytes": _peak_rss(process),
                    "cudaAllocatedBytes": int(torch.cuda.memory_allocated(0)),
                    "cudaReservedBytes": int(torch.cuda.memory_reserved(0)),
                    "cudaPeakAllocatedBytes": int(torch.cuda.max_memory_allocated(0)),
                    "cudaPeakReservedBytes": int(torch.cuda.max_memory_reserved(0)),
                    "cudaDevice": torch.cuda.get_device_name(0),
                },
                "trustRemoteCode": False,
                "localFilesOnly": True,
            }
        )
    except Exception as error:  # fail closed with a bounded error class, never partial model output
        name = type(error).__name__
        payload["error"] = {
            "kind": "oom" if "OutOfMemory" in name else "validation" if isinstance(error, ValueError) else "runtime",
            "class": name,
        }
    finally:
        model = None
        gc.collect()
        if torch is not None and torch.cuda.is_available():
            torch.cuda.empty_cache()
            payload["cleanup"] = {
                "cudaAllocatedBytes": int(torch.cuda.memory_allocated(0)),
                "cudaReservedBytes": int(torch.cuda.memory_reserved(0)),
            }
        else:
            payload["cleanup"] = {"cudaAllocatedBytes": 0, "cudaReservedBytes": 0}
        payload["elapsedMs"] = round((time.perf_counter() - started) * 1_000)
        print(json.dumps(payload, ensure_ascii=False, sort_keys=True), flush=True)
    return 0 if payload["status"] == "ok" else 2


if __name__ == "__main__":
    raise SystemExit(main())
