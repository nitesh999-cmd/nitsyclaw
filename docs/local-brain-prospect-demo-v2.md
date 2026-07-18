# Local Brain prospect demo V2

This is a prospect-facing, owner-only private preview built entirely with fictional data. It is not evidence of public multi-user readiness.

## One-command run

Prerequisites:

- Ollama is running on `http://127.0.0.1:11434`.
- Existing models are `qwen3:8b` and `nomic-embed-text:latest`.
- The shell contains no real database URL, production marker, provider credential, or cloud-model key.

```powershell
cd C:\Users\Nitesh\projects\NitsyClaw-integrate-local-brain
pnpm run local-brain:prospect-demo
```

The runner resets its in-memory state, starts a loopback-only dashboard, allows only localhost dashboard and Ollama traffic, records the real interaction, scans the output, resets state again, and tears down the server. Generated media stays under ignored `output/playwright/local-brain-prospect-demo-v2/` paths.

## Demonstrated story

1. `What should I focus on today?` retrieves a fictional electricity bill due Friday and dentist appointment at 3 pm, then routes the grounded answer through real local Qwen inference.
2. `Correction: I drink coffee, not peppermint tea.` retires the stale memory in fixture state. `What do I drink?` retrieves the corrected coffee preference and excludes the old note.
3. `Message Alex that I accept the quote.` uses the shared PA approval loop, renders a waiting-for-review action, and leaves outbound action calls at exactly zero.

## Fail-closed boundaries

- Requires the exact V2 fixture flag and `local_only` mode.
- Refuses real database URLs, production/Railway/Vercel environments, provider credentials, cloud AI keys, and non-loopback Ollama.
- Uses a single unmistakably fictional owner and fictional life-admin data.
- Protects the POST route with the existing same-origin guard.
- Blocks browser requests outside localhost and records the observed host list.
- Never clicks `Approve and send`.
- Resets state before and after every run, including failure cleanup.

## Final evidence - 2026-07-18

Evidence root: `output/playwright/local-brain-prospect-demo-v2/2026-07-18T10-18-05-104Z/`

Source provenance: implementation commit `23be85d99de54708b522685730bd900ca5ed16c6`; all implementation paths were clean when the artifact was generated. `manifest.sha256.json` records SHA-256 hashes for the evidence and every key media artifact.

Media:

- Master: `local-brain-prospect-demo-v2-master.mp4`
- Source: `local-brain-prospect-demo-v2.webm`
- Duration: 42.12 seconds
- Resolution: 1920x1080
- Video: H.264, 438,532 bps
- Container bitrate: 441,082 bps
- Audio: none; a polished `voiceover-script.txt` is supplied because no credible local voice was assumed.
- Fast-start MP4: enabled by the recording command.
- Phone cut: `local-brain-prospect-demo-v2-phone.mp4`, 42.08 seconds, 1080x1920, H.264, 678,299 bps, no audio.
- No square cut was produced. The dedicated phone recording is stronger than cropping the desktop master.

Quality and safety:

- Sampled every 5 seconds; full-stream black and freeze scans passed.
- Black events: 0. Freeze events: 0.
- Opening benefit appears within 4 seconds.
- Desktop typography floor: pass. The wide master is not labelled phone-readable.
- Dedicated phone-cut typography: pass at 48-51 output pixels.
- Caption overlap: pass; opening and closing use dedicated cards, interaction scenes have no overlay caption.
- Local-only route: pass. Real Qwen used: pass.
- Old memory retired: pass.
- Outbound action calls: 0.
- External browser hosts: none. External server connections: 0.
- Next's development-only version check was answered by a local in-process mock; the network guard blocks every other non-loopback server connection.
- Automated text privacy scan: pass for rendered text, demonstrated replies, voiceover, sanitized server logs, request metadata, and source metadata.
- Binary screenshots and sampled video frames: visually inspected at full resolution; only fictional data was visible.
- Fixture reset before and after: pass.

Artifacts include `00-opening.png`, `00-hero.png`, `01-grounded-focus.png`, `02-correction.png`, `03-corrected-recall.png`, `04-approval-waiting.png`, `05-ending.png`, `phone-approval-waiting.png`, desktop and phone contact sheets, five-second quality frames, `evidence.json`, `manifest.sha256.json`, and the voiceover script.

## Verification

- Focused V2 tests: pass; 8/8 in the final focused rerun.
- Same-origin route security tests: pass; 12/12.
- `pnpm typecheck`: pass for shared, bot, and dashboard.
- `pnpm lint`: pass with zero errors and six existing warnings.
- `pnpm test`: pass; 210 files, 1,077 tests.
- `pnpm build`: pass for bot and dashboard.
- `pnpm run local-brain:release-gate` with explicit local-only Ollama env: pass; policy 36/36, retrieval 25/25, top-1/top-3/grounding 100%, zero privacy/injection/stale-memory failures.
- `pnpm run local-brain:controlled-demo`: pass; all nine checks, real local Qwen in 1,606.8 ms, and zero action calls.
- `pnpm run local-brain:browser-proof`: pass; refreshed evidence at `output/playwright/local-brain-browser-proof/2026-07-18T10-09-00-452Z/evidence.json`.
- `pnpm run whatsapp:release-gate`: pass in explicit dry/no-send scope; no Railway mutation, WhatsApp send, or provider action.
- `pnpm run local-brain:prospect-demo`: pass with the final same-origin-protected route.

## Honest V1 versus V2 assessment

V1 remains unchanged as the deeper engineering proof. Its 71.5-second, mostly static test-report presentation was technically convincing but weak for prospects. V2 is 42.2 seconds, begins with the customer benefit, visibly types and answers real requests, demonstrates correction, and ends on user control.

Subjective internal score: V1 engineering proof 9/10 and prospect persuasiveness 3.5/10; V2 engineering proof 9/10 and independently reviewed controlled prospect readiness 9/10. V2 is suitable for owner-led prospect interviews, not self-serve public access, public advertising, or a product launch.

Three independent review passes found no P0 issue. They initially flagged server-egress proof, scan wording, unsupported input handling, inert approval controls, provenance, and phone readability; the second pass then caught a broken oversized phone canvas. V2 now blocks server egress, locally answers Next's version check, narrows the automated scan claim, handles unsupported requests safely, makes preview controls respond without sending, records commit and artifact hashes, and records at native mobile size before scaling the complete frame to 1080x1920. The final read-only review verified the repaired phone frames fill the complete canvas, the approval UI fits, the artifact hashes match the manifest, and no P0/P1 issue remains.

## Remaining boundary

Public sale remains blocked by account-aware multi-user sessions and unresolved tenant review for messages, feature requests, audit logs, and dashboard authentication attempts. Keep this as an owner-controlled private preview until those boundaries are closed and independently verified.
