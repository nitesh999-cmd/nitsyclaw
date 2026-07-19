# NitsyClaw seven-day owner-only alpha

This alpha is for Nitesh to use the real Local Brain privately on this Windows computer for seven days. It is not a beta, public launch, AppSumo proof, production integration, or multi-user readiness claim.

## Safety boundary

- All chat inference uses the existing `qwen3:8b` model through loopback Ollama.
- All semantic memory retrieval uses the existing `nomic-embed-text` model through loopback Ollama.
- `local_only` is mandatory. There is no cloud model or fallback client in the owner-alpha process.
- The launcher removes database, WhatsApp, email, calendar, notification, analytics, Railway, Vercel, and cloud-provider environment values from the child session, then restores the parent PowerShell environment when the alpha exits.
- The owner-alpha process separately refuses production markers, provider credentials, database URLs, remote Ollama URLs, wrong models, or non-local-only mode.
- The Ollama fetch boundary accepts HTTP loopback hosts only.
- The alpha has no outbound connector or action handler. External and destructive requests remain `awaiting_approval` with zero execution. There is deliberately no approve-and-send command.
- Every memory carries a random local owner hash. State loading and retrieval recheck that owner scope and fail closed on a foreign-owner row.
- Corrected and forgotten memories are excluded. Stored prompt-injection patterns are rejected on write and filtered again on retrieval. Retrieved memory remains wrapped as untrusted data.
- Conversation turns and model responses are not persisted. Only text explicitly accepted through `/remember` or `/correct`, retired memory audit rows, and scorecard entries are stored.
- A process lock permits only one owner-alpha session to read and write the local state at a time. A second launch fails closed; a lock left by a dead process is recovered on the next launch.
- Storage refuses symbolic links and Windows junctions at the `NitsyClaw/owner-alpha` boundary, so an override cannot silently redirect writes or removal into another folder.
- No bulk import exists. Enter only small amounts of low-risk information manually. Do not enter passwords, tokens, financial details, health information, government identifiers, customer data, confidential client material, or anything you would not keep as a plain local note.

## Start and daily use

Use `owner-alpha.ps1` from the repository. The launcher sets the exact local model configuration, runs the health check, and opens the interactive session only when every check passes.

The launcher also accepts `-Health` for a non-interactive health-only run. Normal owner use does not need that switch because the same health gate runs automatically at startup.

Normal text asks the real local Qwen model. The response footer shows the local route, model, retrieved-memory count, and measured response time.

Commands inside the session:

- `/remember` — manually store one low-risk fact or preference after typed confirmation.
- `/correct` — select an exact active memory, retire it, and store its replacement after typed confirmation.
- `/forget` — retire an exact active memory from retrieval after typed confirmation.
- `/memories` — review active local memories.
- `/health` — rerun model, embedding, storage, local-route, and approval-hold checks.
- `/score` — record the seven-part daily scorecard.
- `/where` — show the local data folder.
- `/remove-data` — remove the complete owner-alpha data folder after exact typed confirmation.
- `/exit` — shut down cleanly.

Commands are case-insensitive, so `/HELP` and `/help` behave the same. Memory text keeps its original casing. Identical active memories are rejected, including duplicates that differ only by letter case or surrounding whitespace. Conflicting facts are not guessed away: use `/correct` to select and retire the stale fact explicitly.

## Seven-day routine

Each day:

1. Start the alpha and confirm health is `PASS`.
2. Ask two or three real, low-risk questions.
3. Add at most one or two explicit low-risk memories when useful.
4. On at least two days, correct a saved memory and verify the new answer uses only the correction.
5. On at least two days, ask for an external action such as sending an email and verify it waits for approval with zero executions.
6. Run `/score` before shutdown.
7. Use `/exit` or Ctrl+C. The launcher starts no background dashboard or bot process; Ollama remains managed by its existing desktop service.

The scorecard covers:

1. useful memory,
2. correction accuracy,
3. response quality,
4. response speed,
5. approval behaviour,
6. privacy confidence,
7. crashes or confusing behaviour.

Scores use 1 (poor) to 5 (excellent). For crashes/confusing behaviour, 5 means no problem. The scorecard also records the session's measured median model response time and an optional note. The local Markdown scorecard path is shown after each `/score` entry.

At any rating prompt, leave the answer blank or enter `/cancel` to cancel the whole score entry. No partial score is written. Entering `/score` again on the same Sydney date replaces that day's entry rather than creating a duplicate.

## Health check

Startup and `/health` must prove all of the following before the alpha is considered usable:

- exact `local_only` mode,
- loopback-only Ollama,
- Ollama online,
- exact `qwen3:8b` chat model,
- exact `nomic-embed-text` embedding model,
- real local embedding generated,
- real local Qwen response routed locally,
- external-action probe held for approval,
- zero action calls,
- owner-alpha storage available.

Any failure stops startup or is displayed as `FAIL`. Do not bypass a failed check.

## Shutdown and local-data removal

For normal shutdown, type `/exit` or press Ctrl+C. No dashboard, bot, WhatsApp client, email worker, calendar worker, or other background process is launched by this alpha.

For removal, start the same owner-alpha launcher, type `/remove-data`, inspect the exact displayed folder, then type `REMOVE LOCAL ALPHA DATA`. This deletes only the exact `%LOCALAPPDATA%\NitsyClaw\owner-alpha` directory. It removes active memories, retired correction/forget records, and scorecards. It does not uninstall Ollama, delete `qwen3:8b`, delete `nomic-embed-text`, change the repository, or affect production data.

The removal phrase is byte-for-byte exact. Different case, leading or trailing spaces, a partial phrase, or blank input removes nothing. If Windows reports a locked file or removal is interrupted, close the program holding the file and run the same removal flow again. Removal is idempotent when the folder is already absent. Do not manually broaden the deletion path.

The alpha stores plain JSON and Markdown under the current Windows user's Local AppData folder. Windows account access is the practical local boundary; the files are not separately encrypted. That is why the alpha is restricted to small, low-risk information.

## Failure and recovery notes

- `Another owner-alpha session is already running`: return to the first terminal and use `/exit`. Do not run two writers.
- `session lock is unreadable`: stop. Inspect only the displayed owner-alpha folder and use the documented complete local-data removal flow if you want a clean reset.
- invalid JSON, duplicate memory ids, foreign owner scope, invalid dates, or malformed metadata: startup fails closed. Preserve the folder if a bug report is needed; otherwise remove the complete alpha data with the documented flow. Do not hand-edit a partially understood state file.
- scorecard refresh warning: the JSON state was saved, but the derived Markdown view could not be refreshed. Run `/health`; it must fail until the file/folder permission or name collision is corrected.
- missing model, empty response, timeout, or unreachable Ollama: health shows `FAIL` and the interactive session does not open. Restore the existing Ollama service/models; never add a cloud fallback.

## Stop rules

Stop the alpha and report instead of continuing if:

- any health check fails,
- Ollama is not loopback-only,
- the exact two models are unavailable,
- an owner-scope mismatch is detected,
- instruction-like memory is not rejected,
- a corrected or forgotten memory reappears,
- any action executes or any outbound/provider connection is attempted,
- a database, Railway, Vercel, production, or cloud-provider environment reaches the owner-alpha process,
- local data cannot be removed from the exact displayed folder.
