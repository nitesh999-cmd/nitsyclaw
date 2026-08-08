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

## Activation boundary

This repair is code-only until the local bot runtime is explicitly restarted on the repaired commit. No deployment, push, runtime restart, provider change, or live WhatsApp proof was performed as part of the incident repair.
