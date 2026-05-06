# NitsyClaw Feature Batches

This file tracks feature batches that have been implemented in code.

## Batch 1 - Personal OS Foundations

Implemented in `packages/shared/src/features/22-personal-os.ts`.

Tools added:

1. `create_first_day_wizard` - guided first-day setup for normal home users.
2. `plan_travel_aware_mode` - temporary travel context without overwriting home.
3. `create_people_memory_card` - structured memory card for important people.
4. `extract_waiting_on_items` - turns loose follow-up text into waiting-on items.
5. `capability_boundary_summary` - explains what NitsyClaw can do, needs setup, or must not do.
6. `create_data_inventory_map` - maps personal data types, sources, encryption, retention, and controls.
7. `label_action_risk` - labels action risk and confirmation requirements.
8. `draft_consent_receipt` - creates plain-English permission receipts.
9. `plan_private_mode` - defines private-mode behavior and limits.
10. `review_memory_candidate` - decides whether facts should be pinned, reviewed, or not saved.

Verification:

- `pnpm test -- packages/shared/test/22-personal-os.test.ts packages/shared/test/system-prompt.test.ts packages/shared/test/tools-registry.test.ts`

Next batch candidates:

1. Persist first-day wizard answers into profile context.
2. Persist travel mode with expiry and dashboard controls.
3. Persist people memory cards with review/delete controls.
4. Persist waiting-on items with reminders.
5. Add a visible capability boundary page.
6. Add a dashboard data inventory page.
7. Add risk labels to confirmation UI.
8. Store consent receipts in audit/activity.
9. Add private-mode UI toggle.
10. Add memory review inbox UI.

## Batch 2 - Memory And Operations Quality

Implemented in `packages/shared/src/features/23-memory-ops.ts`.

Tools added:

1. `detect_stale_memory` - reviews stale, time-sensitive, and historical memory.
2. `create_memory_source_link` - creates traceability records for memories.
3. `rank_priority_items` - ranks work by impact, risk, due date, and age.
4. `parse_one_command_capture` - classifies one-line captures into useful buckets.
5. `create_agent_run_log` - records decisions, files, commands, errors, and verification.
6. `plan_job_retry_policy` - chooses retry/backoff/escalation behavior.
7. `parse_safe_command` - extracts intent, target, channel, risk, and confirmation requirement.
8. `create_ops_slo_snapshot` - scores operational health from simple signals.
9. `create_incident_timeline` - records incident symptoms, actions, and recovery proof status.
10. `plan_live_smoke_suite` - prepares safe production smoke checks.

Verification:

- `pnpm test -- packages/shared/test/23-memory-ops.test.ts packages/shared/test/system-prompt.test.ts packages/shared/test/tools-registry.test.ts`

Next batch candidates:

1. Persist first-day wizard answers into profile context.
2. Persist travel mode with expiry and dashboard controls.
3. Persist people memory cards with review/delete controls.
4. Persist waiting-on items with reminders.
5. Add visible capability boundary and data inventory pages.
6. Add risk labels to confirmation UI.
7. Store consent receipts in audit/activity.
8. Add private-mode UI toggle.
9. Add memory review inbox UI.
10. Add ops SLO and incident dashboard sections.
