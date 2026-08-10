# Whisper large-v3 offline quality gate - 10 August 2026

## Decision

**FAIL.** The fixed two-case smoke did not pass, so `NITSYCLAW-VOICE-EVAL-v1`
was not constructed or run. Voice remains **NO GO** and no live WhatsApp test is
authorized by this evidence.

## Artifact provenance

| Field | Verified value |
|---|---|
| Source repository | `ggerganov/whisper.cpp` |
| Pinned revision | `c521a4b02f422512d734391fdf08bb08c0862f68` |
| URL | `https://huggingface.co/ggerganov/whisper.cpp/resolve/c521a4b02f422512d734391fdf08bb08c0862f68/ggml-large-v3.bin?download=true` |
| Filename | `ggml-large-v3.bin` |
| Exact size | `3,095,033,483` bytes |
| SHA-256 | `64d182b440b98d5203c4f9bd541544d84c605196c4f7b845dfa11fb23594d1e2` |
| Integrity timing | Size and SHA-256 verified before the file was renamed or loaded |

Handy 0.9.4 discovered the file as custom model ID `ggml-large-v3`. Its selected
model was changed through the Handy UI and persisted as `ggml-large-v3`.

## Fixed smoke contract

The pre-existing thresholds were not changed after observing results:

| Measure | Threshold |
|---|---:|
| English WER | <= 0.20 |
| Hinglish WER | <= 0.40 |
| Critical entity accuracy | 1.00 |
| Language accuracy | 1.00 |
| Per-clip round-trip latency | <= 45,000 ms |
| Temporary artifact cleanup | 100% |

The candidate was selected only for the evaluation process with
`NITSYCLAW_HANDY_MODEL=ggml-large-v3` and
`NITSYCLAW_HANDY_DEVICE_INDEX=0`. `HF_HUB_OFFLINE=1` and
`TRANSFORMERS_OFFLINE=1` were set. The first sandboxed attempt stopped before
audio processing because it could not resolve the installed WinGet FFmpeg link;
the approved local rerun reached the complete pipeline.

## Nemotron versus Whisper smoke scorecard

Nemotron values are the fixed 9 August 2026 baseline from
`docs/whatsapp-voice-intelligence.md`. Whisper values are from the same two-case
SAPI-to-local-ASR script on 10 August 2026.

| Measure | Nemotron baseline | Whisper large-v3 | Whisper gate |
|---|---:|---:|---|
| English WER | 0.158 | 0.316 | fail |
| English critical entities | 0.875 | 0.500 | fail |
| Hinglish WER | 1.714 | 1.333 | fail |
| Hinglish critical entities | 0.000 | 0.000 | fail |
| Language accuracy | 0.500 | 0.500 | fail |
| English round-trip latency | 1,658 ms | 10,786 ms | pass |
| Hinglish round-trip latency | 1,591 ms | 4,739 ms | pass |
| Cleanup | 100% | 100% | pass |
| Provider confidence | null | null | safe limitation |

## Failed synthetic cases

### `english-solar-au`

- Expected: `Please call Raj Sharma in Melbourne tomorrow at three thirty P M about the ten kilowatt Fronius solar inverter.`
- Observed: `Please call Raj Sharma in Melbourne tomorrow at 3.30pm about the 10kW Fronius solar inverter.`
- Fixed score: WER `0.316`; critical entities `0.500`; detected language `english`.
- Diagnosis: the transcript is semantically close, but the frozen scorer treats
  formatted time and unit tokens as substitutions and requires the literal
  number words. That limitation cannot be repaired after seeing candidate
  output without invalidating this pre-scored smoke.

### `hinglish-business`

- Expected: `Kal subah Ravi ko Sydney mein call karna aur Tesla Powerwall three ka quote fifteen percent discount ke saath check karna.`
- Observed: `कल सुबह रवे को सिडनी में कॉल कना ओयल टेसला पववल 3 का 15% डिसकाउंट के साथ चेक कना`
- Fixed score: WER `1.333`; critical entities `0.000`; detected language `hindi`.
- Diagnosis: the model returned Devanagari for Roman Hinglish, altered the proper
  name and Powerwall term, and did not preserve all action-critical wording.
  Script and numeric normalization would improve measurement fidelity, but the
  observed critical errors still prevent an action-safe pass.

## Vulkan, memory, isolation, and cleanup evidence

Handy reported device 0 as `kind=vulkan name=NVIDIA GeForce RTX 4060`. For both
diagnostic replays it reported `requested_device: index 0`,
`bound_backend: Vulkan0`, and logged that `ggml-vulkan.dll` loaded before the
model bound to `Vulkan0`.

| Case | Model load | ASR | Peak Handy RAM | Baseline GPU memory | Peak GPU memory | Observed non-loopback connections |
|---|---:|---:|---:|---:|---:|---:|
| English | 2,373 ms | 5,423 ms | 1,188,753,408 bytes | 2,993 MiB | 6,427 MiB | 0 |
| Hinglish | 2,537 ms | 1,137 ms | 230,477,824 bytes | 2,743 MiB | 6,333 MiB | 0 |

The diagnostic monitor sampled the Handy process throughout both runs. This is
evidence of no observed connection, not a claim of a kernel-enforced network
sandbox. Handy's headless contract states that `--transcribe-file` performs no
download and requires an already-installed model. Both temporary WAV pairs were
removed, the NitsyClaw smoke reported cleanup success, and no diagnostic WAV
remained afterward.

## Confidence and release boundary

Handy 0.9.4 returned no calibrated token or segment probability in this path.
NitsyClaw therefore kept `providerConfidence` as `null`; it did not manufacture a
confidence value. Action-critical names, recipients, dates, numbers, amounts,
addresses, model numbers, and corrections must remain confirmation-gated.

The temporary NitsyClaw allowlist addition used to execute the candidate smoke
was removed after the failure. The production default and reviewed runtime
allowlist remain unchanged. No WhatsApp message, WhatsApp restart, live voice
proof, customer recording, personal recording, cloud ASR/TTS request, additional
model, dependency change, global installation, deployment, push, merge, or OAuth
change occurred.
