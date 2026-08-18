# WhatsApp self-chat incident - 7 August 2026

## Scope

NitsyClaw repository, local bot runtime, scheduler, sanitized logs, and NitsyClaw database records only. No other assistant or command-centre workspace was inspected.

## Evidence timeline (Australia/Melbourne)

| Time | Evidence |
|---|---|
| 20:29:26.534 | One two-character owner self-chat message was accepted and persisted. |
| 20:29:27.909 | The foreground answer-only request started on the local model route. The audit reason was `sensitive_data_stays_local`; cloud fallback was false. |
| 20:30:00 | The Melbourne-time focus close-out found no daily-focus row and sent the supplied “no ONE was set” close-out. No ONE was selected or fabricated. |
| 20:30:00 | The five-minute entity-extraction scheduler fired and selected recent messages, including the same inbound message. |
| 20:30:01.838 | The background extraction opened a second local-model request while the foreground request was still active. |
| 20:30:12.931 | The foreground request failed after 45.022 seconds with `ollama_timeout`. |
| 20:30:13.801 | The command job recorded its first failed attempt as retrying under the old three-attempt policy. The generic error reply followed through the WhatsApp handler fallback. |
| 20:30:23.628 | The background extraction request completed after 21.790 seconds. |
| 20:30:23.966 | Extraction wrote the empty topic sentinel for that same source message. |
| 21:00 | The nightly report treated the last successful send, about 1,799 seconds earlier, as stale even though sends are event-driven. |

The bot process remained alive throughout the incident. The database accepted the inbound message, command job, routing audits, and extraction result. No cloud-model fallback was used.

## Root cause

The first causal backend failure was a local Ollama timeout on the foreground self-chat request. The proven contributing condition was concurrent scheduled entity extraction against the same local model. The scheduler did not coordinate with the interactive request.

## Ruled out by evidence

- Provider authentication failure
- Cloud provider fallback
- Empty model response
- Tool execution failure
- Database or state-write failure
- Wrong Melbourne date/timezone
- Missing ONE selection
- Bot restart during the incident
- WhatsApp client disconnect as the first causal failure

## ONE status

No daily-focus row, candidates, or chosen ONE existed for 7 August. Therefore no ONE was required. The old close-out copy incorrectly promised a next-morning selection flow that the scheduled morning brief did not implement.

## Repair

- Serialize local-model work and skip background extraction while interactive work is active.
- Process at most one recent message per extraction tick.
- Persistently claim scheduled run buckets so process restarts cannot duplicate outward scheduled work.
- Make foreground WhatsApp command failures terminal after one attempt; retry only after an explicit new user message.
- Reject empty/suppressed model results as visible failures and return a safe correlation reference.
- Distinguish provider timeout, provider unavailable, authentication, empty response, and generic backend failures without exposing internals.
- Classify successful event heartbeats as idle rather than stale.
- Detect a local Git commit directly; otherwise report unavailable with the reason.
- Persist alert cooldown claims across restarts and send a separate recovery notification on error-to-success state change.
- Make ONE close-out wording truthful and prohibit fabricated selection or automatic roll-forward.
- Bind the local recovery/health listener to loopback by default while preserving Railway's required all-interface binding.

## Historical activation boundary

Immediately after the incident repair, the change was code-only pending an explicitly approved local restart and owner self-chat test. No deployment, push, provider change, or non-owner message was part of that repair stage. The later closure evidence below supersedes the code-only delivery status.

## Closure evidence - 8 August 2026

**Status: PASS for owner-only local use.**

- The repaired local bot was restarted and remained healthy on the follow-up repair commit `70e9211`.
- Exactly one separately approved owner-only ACK test was submitted from the local runtime. No other recipient was contacted.
- Sanitized telemetry for that exact outbound message and recipient recorded client acceptance, local self-echo, creation of a real WhatsApp message ID, ACK progression to `3`, no ACK deadline expiry, and no late ACK.
- The ACK was correlated by the exact normalized outbound message ID and recipient. Local self-echo was recorded separately and was not treated as delivery proof.
- The owner subsequently confirmed phone visibility with `ACK TEST VISIBLE`. This provides the required user-visible confirmation independently of the automated ACK telemetry.
- The live observation exposed an ID-less `sendMessage` resolution even though `message_create` had already supplied the exact ID and recipient. Commit `70e9211` repaired that false-negative path while preserving exact ID-and-recipient correlation, duplicate prevention, loop protection, and fail-closed behavior.

The delivery incident is closed as **PASS** for the private owner-only local self-chat configuration. This does not establish delivery behavior for other recipients, multi-user use, a deployed environment, or a public release.

## Closure verification

- ACK telemetry, persistence, and harness regression tests: 35 passed.
- Complete WhatsApp release gate: passed, including receipt guard, smoke, capability, and reply-shape suites.
- Complete applicable unit and integration suite: 217 files and 1,163 tests passed.
- Typecheck: passed.
- Lint: passed with zero errors and five pre-existing warnings.
- No additional WhatsApp message was sent for evidence closure. No push, deployment, merge, or OAuth change was performed.

## Remaining non-delivery risk

Concurrent local processes can overwrite the persisted latest-attempt telemetry snapshot through last-writer-wins heartbeat persistence. The exact ACK evidence above was captured before that overwrite and phone visibility was independently confirmed, so this does not negate the owner-only delivery PASS. Durable multi-process historical ACK retention remains conditional and must be repaired before the telemetry file is treated as a standalone audit log.
