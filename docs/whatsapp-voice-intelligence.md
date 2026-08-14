# WhatsApp Voice Intelligence

Status: local-first owner-only implementation; live WhatsApp proof is deliberately approval-gated.

## Architecture decision

Restore voice input by replacing its cloud-only dependency with the strongest already-installed, reviewed local path. Reuse the existing typed-message router, confirmation gates, command-job persistence, loop guard, duplicate prevention, model work coordinator, owner verification, and repaired outbound ACK coordinator. Add native voice output only after locally generated audio passes a strict Ogg Opus boundary.

The selected flow is:

1. `whatsapp-web.js` accepts only the verified owner self-chat and downloads the media in memory.
2. The router persists a received command job and hashed correlation before processing.
3. `LocalVoiceTranscriber` validates declared and actual size, signature, MIME, stream count, container, codec, duration, sample rate, and channel count.
4. A private OS-temp directory holds `input.media` and decoded 16 kHz mono PCM. FFmpeg receives fixed argument arrays with `shell: false`, one thread, bounded allocation, output, and deadlines.
5. Installed Handy 0.9.4 runs the allowlisted Nemotron 3.5 ASR 0.6B Q8 model locally. The raw audio and WAV are removed on every bounded success or failure path.
6. The transcript is treated as untrusted owner content and enters the same intent, confirmation, tool, recipient, memory, and approval pipeline as typed text.
7. A single serialized owner-turn queue preserves voice/text order. The shared work coordinator serializes GPU-heavy ASR, Ollama, embeddings, extraction, and TTS.
8. Reply policy chooses text or voice from the owner preference plus an explicit per-turn instruction. Structured answers use a short voice overview plus full text.
9. Local SAPI generates English/romanized Hinglish speech; FFmpeg converts it to validated 48 kHz mono Ogg Opus. Hindi/Devanagari voice output fails closed until a separate local Hindi TTS model is approved.
10. `whatsapp-web.js` sends native voice with `sendAudioAsVoice: true` through the existing pre-registered, persisted ACK coordinator. A local self-echo is never delivery proof.

No audio, transcript, or generated speech is sent to OpenAI or another cloud voice provider. An `OPENAI_API_KEY` may still be used by separately approved dashboard/embedding paths; it is not read by WhatsApp ASR or TTS.

## Recovered history

- `4ea85bc` (2026-04-26) introduced voice-note input through the OpenAI Whisper API.
- `b482c34`, `b7f1b13`, and `ad19ac6` later added replay, multilingual routing, and the voice memo router.
- Git history contains no prior `sendAudioAsVoice` implementation: voice output was never shipped.
- The input feature was not intentionally removed. It remained cloud-key-dependent while documentation and runtime expectations drifted, so it appeared unavailable when the cloud configuration was missing or unsuitable.
- Sanitized database evidence shows 42 inbound WhatsApp voice rows and 41 stored transcripts between 2026-05-12 and 2026-07-29. No transcript contents were inspected for recovery.

## Data lifecycle and privacy

| Data | Location | Retention |
|---|---|---|
| Downloaded source audio | Buffer, then owner OS temp | Removed immediately after success or bounded failure; never stored in the database |
| Decoded PCM | Owner OS temp | Removed with the source temp directory |
| Transcript | Existing encrypted message/command storage | Existing message-retention policy; never automatically promoted to long-term memory |
| Generated WAV/Ogg | Owner OS temp, then outbound memory buffer | Temp removed before return; outbound buffer released by the process |
| Preferences | Existing encrypted/scoped profile context | Until owner changes/deletes profile data |
| Telemetry | Database/logs | Hashed message/correlation IDs and stage/quality/timing only |

`Show transcript` reveals only the latest owner-scoped encrypted transcript. `Forget that transcript` or `Delete this recording` clears the stored transcript and transcript-derived memories; raw audio has already been deleted. Corrections update the correlated prior transcript and pending intent but never replay a completed external action.

Logs must never contain a raw phone number, message body, transcript, file content, credential, or audio. The voice boundary logs only sanitized correlation, stage, duration, quality, and language classification.

## Accepted media and budgets

| Boundary | Limit |
|---|---:|
| Encoded media | 8 MiB maximum |
| Duration | 180 seconds maximum |
| Channels | 1-2 input; 1 decoded/output |
| Input sample rate | 8-96 kHz |
| Decoded ASR format | 16 kHz mono PCM S16LE WAV |
| Native reply format | Ogg Opus, mono, 48 kHz, <=2 MiB, <=90 seconds |
| Metadata probe | 10 seconds |
| Decode | 30 seconds |
| ASR | 45-600 seconds, duration-scaled |
| TTS synthesis/encode | 30 seconds per subprocess |
| Outbound submission/ACK | Existing bounded 45-second stages |
| Pending ASR work | 4 jobs maximum; inference serialized |
| Owner message order | One serialized voice/text turn at a time; queue limit 8 |

Supported input contracts are Ogg/Opus, WebM/Opus, MP4 or M4A/AAC, MP3, and PCM WAV. Exactly one audio stream is required. Polyglots, extra streams, corrupt/truncated containers, MIME or codec spoofing, excessive shapes, invalid declarations, silence, and unsupported formats fail before intent execution.

## Language and reply behavior

- Input ASR model: English and Hindi are transcription-ready; Hinglish/code-switching is accepted and independently classified from transcript script/lexicon rather than trusting WhatsApp metadata.
- Provider confidence: Handy CLI does not expose calibrated segment probabilities, so provider confidence remains `null`. NitsyClaw does not invent a percentage.
- Output today: English and romanized Hinglish use the installed Windows Ravi voice. Hindi/Devanagari output is blocked with an honest text fallback.
- Reply language is preserved when determinable, unless the owner says `Speak in English`, `Speak in Hindi`, or `Speak in Hinglish`.
- Background/quoted actionable speech asks one short clarification. Fake system/tool instructions remain ordinary untrusted transcript text.

## Owner commands

- `Reply in text`
- `Reply by voice`
- `Voice mode on`
- `Text mode on`
- `Automatic mode`
- `Show transcript`
- `Delete this recording`
- `Forget that transcript`
- `Speak more briefly`
- `Speak in English`
- `Speak in Hindi`
- `Speak in Hinglish`

Mode and language commands use the existing owner-scoped profile-context storage. Explicit per-turn wording overrides the stored default for that turn.

## Evaluation contract

Thresholds were fixed before the final local benchmark:

- synthetic English WER <= 0.20;
- synthetic Hinglish WER <= 0.40;
- critical names/numbers/solar/place tokens = 100%;
- language classification accuracy = 100%;
- each short synthetic round-trip <= 45 seconds;
- temporary artifact cleanup = 100%;
- duplicate task/reply rate = 0 in deterministic race tests;
- raw-content privacy leakage rate = 0 in static and log tests;
- live naturalness requires a later owner rating and cannot be inferred from synthetic audio.

Run `pnpm run voice:eval-local` for the private, repository-authored SAPI-to-local-ASR set. It stores no recordings and declares Hindi acoustic evaluation unavailable until an approved local Hindi voice or explicitly approved recording is available. Do not lower thresholds after a failure merely to produce a pass.

### Baseline result (2026-08-09)

The fixed-threshold local benchmark completed end to end and returned **NO GO for live WhatsApp proof**:

| Measure | Threshold | Result | Gate |
|---|---:|---:|---|
| English WER | <=0.20 | 0.158 | pass |
| English critical entities | 100% | 87.5% | fail |
| Hinglish WER | <=0.40 | 1.714 | fail |
| Hinglish critical entities | 100% | 0% | fail |
| Language classification | 100% | 50% | fail |
| English local ASR latency | <=45s | 1.658s | pass |
| Hinglish local ASR latency | <=45s | 1.591s | pass |
| Temporary artifact cleanup | 100% | 100% | pass |

Provider confidence remained `null`, as required, because the installed CLI exposes no calibrated confidence value. Hindi acoustic evaluation and Hindi/Devanagari voice output remain unavailable without a separately approved local model or recording. No live WhatsApp message was sent, and no model was installed in response to this result.

## Failure and restart behavior

- Missing local tool/model: honest text failure, no cloud fallback.
- Low confidence or ambiguous background command: clarification, no action.
- Synthesis failure before submission: one useful truthful text fallback.
- Any voice submission uncertainty after the send call starts: no automatic text or voice retry, preventing duplicates.
- Restart while a voice command job is `working`: recover as failed and require a new owner instruction; never replay a possibly executed task.
- ACK pending across restart: existing persisted ACK state reattaches observation and correlates exact message ID plus recipient.
- Progress is text-only and emitted only after validation for recordings longer than 45 seconds; it does not close the source lifecycle.

## Tool and licence review

- Handy 0.9.4: already installed, offline speech-to-text application, MIT-licensed source. No repository dependency added.
- Nemotron 3.5 ASR streaming 0.6B GGUF Q8: already installed, OpenMDW-1.1 model terms, multilingual and transcription-ready for English and Hindi. It is allowlisted by exact repository/model path.
- FFmpeg/ffprobe 8.1.2 Gyan full build: already installed externally; GPLv3 build, invoked but not copied or redistributed by NitsyClaw.
- Windows System.Speech/SAPI: existing OS component, invoked by a fixed allowlisted script.
- whatsapp-web.js 1.34.7: existing pinned dependency; native voice uses its documented `sendAudioAsVoice` option.

No package, model, codec, driver, service, OS tool, or global package was installed for this change.

## Live proof gate

Do not perform a live WhatsApp voice proof until every non-live gate passes and Nitesh explicitly approves the bounded owner-only sequence. A later proof may contain at most one owner voice note, one text reply, one generated voice reply, and one explicit transcript deletion test. It must capture exact-message ACK evidence and separate phone-visibility confirmation without treating local self-echo as delivery.
