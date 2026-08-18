"""V1.4 strict UTF-8 transport shim for the frozen Qwen3-ASR adapter."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import sys
from pathlib import Path
from types import ModuleType
from typing import Any


BASE_ADAPTER_SHA256 = "ee84c72ceaedf57946c6c12a66f7fac9977ece5d792fa6926a24b0c8c0ec69b8"


def _configure_utf8_streams() -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="strict")
    sys.stderr.reconfigure(encoding="utf-8", errors="strict")
    if sys.stdout.encoding.lower().replace("_", "-") != "utf-8":
        raise RuntimeError("stdout is not strict UTF-8")
    if sys.stderr.encoding.lower().replace("_", "-") != "utf-8":
        raise RuntimeError("stderr is not strict UTF-8")


def _load_frozen_adapter() -> ModuleType:
    path = Path(__file__).with_name("qwen3-asr-adapter.py").resolve(strict=True)
    if hashlib.sha256(path.read_bytes()).hexdigest() != BASE_ADAPTER_SHA256:
        raise RuntimeError("the frozen V1.1 adapter hash changed")
    spec = importlib.util.spec_from_file_location("nitsyclaw_qwen3_asr_adapter_v11", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("the frozen V1.1 adapter could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--audio-root", required=True)
    parser.add_argument("--case", action="append", default=[])
    parser.add_argument("--max-new-tokens", type=int, default=128)
    parser.add_argument("--mode", choices=("diagnostic", "scored"), required=True)
    args = parser.parse_args()
    if args.max_new_tokens != 128:
        raise ValueError("max_new_tokens is frozen at 128")
    if args.mode == "diagnostic" and len(args.case) != 1:
        raise ValueError("diagnostic mode requires exactly one case")
    if args.mode == "scored" and len(args.case) != 2:
        raise ValueError("scored mode requires exactly two cases")
    return args


def main() -> int:
    _configure_utf8_streams()
    adapter: Any = _load_frozen_adapter()
    adapter._arguments = _arguments
    return int(adapter.main())


if __name__ == "__main__":
    raise SystemExit(main())
