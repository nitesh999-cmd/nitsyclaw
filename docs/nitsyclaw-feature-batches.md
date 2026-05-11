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

## Batch 3 - Integration Request Router V2

Implemented across:

- `packages/shared/src/features/17-integration-capabilities.ts`
- `packages/shared/src/features/19-integration-requests.ts`
- `packages/shared/src/agent/system-prompt.ts`
- `apps/dashboard/src/app/integrations/page.tsx`

What changed:

1. Added honest capability statuses for Calendar, Contacts/Birthdays, Fuel Prices, and Spotify Music.
2. Expanded the safe request rail with:
   - `queue_email_connection_request`
   - `queue_calendar_connection_request`
   - `queue_spotify_music_request`
   - `queue_contacts_birthdays_import_request`
   - `queue_fuel_price_request`
3. Kept high-risk integrations honest: no fake email sending, no silent contact import, no live bank feed, no live fuel price claim, no Facebook scraping.
4. Updated the shared system prompt so WhatsApp and dashboard route pending integration asks to the right safe tool.
5. Updated the Integrations dashboard page so these pending capabilities are visible as partial/needs setup/blocked.

Verification:

- `pnpm exec vitest run packages/shared/test/19-integration-requests.test.ts packages/shared/test/integration-capabilities.test.ts packages/shared/test/system-prompt.test.ts packages/shared/test/tools-registry.test.ts integrations-page.test.ts`
- `pnpm -r typecheck`

Still not live-provider complete:

- Gmail/Outlook sending needs OAuth scopes and adapter work.
- Drive/OneDrive/Photos need selected-file/media OAuth import.
- Phone/SMS needs a provider or companion app.
- Bank feeds need CSV import first, then compliant provider evaluation.
- Fuel prices need a reliable regional live data source.

## Batch 4 - CSV-first expense import

Implemented across:

- `packages/shared/src/features/10-receipt-expense.ts`
- `apps/bot/src/router.ts`

What changed:

1. Added `import_expenses_csv` so CSV bank/card exports can log expense rows without connecting to a bank.
2. Added CSV parsing for common bank columns: date, description/details, debit, credit, amount, and currency.
3. Skips income/credit rows instead of logging them as expenses.
4. WhatsApp document uploads now detect `.csv` / `text/csv` files and import expense rows before generic document analysis.
5. Reply stays honest: it says how many expenses were imported and how many non-expense rows were skipped.

Verification:

- `pnpm exec vitest run packages/shared/test/10-receipt-expense.test.ts apps/bot/test/router.integration.test.ts packages/shared/test/feature-registry-queued.test.ts`

Still not live-provider complete:

- Live bank feeds still need a compliant provider decision and account consent.
- CSV import currently supports common export shapes, not every bank-specific format.
