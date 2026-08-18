# Voice Verifier V1.2 disposable PostgreSQL rehearsal

Date: 2026-08-12 (Australia/Sydney)

Branch: `codex/whatsapp-voice-intelligence`

Starting commit: `660cd9fc5ac46c0a702e16e32ab6b9d5c9be22df`

Verdict: **PASS for the isolated PostgreSQL migration contract**

Voice release: **NO GO**

No development, staging, production, shared or customer database was opened or
modified. No model, ASR, LLM, TTS, audio, WhatsApp message, WhatsApp restart,
live data, dependency change, installation, successful download, OAuth change,
push, merge, deployment or publication was used.

## PostgreSQL version and isolation

- Server, client, `initdb` and `pg_ctl`: PostgreSQL `17.10` (`170010`), using
  the already-installed binaries under `C:\Program Files\PostgreSQL\17\bin`.
- The installed `postgresql-x64-17` Windows service was not connected to,
  queried, stopped or restarted. Its binaries were reused to start a separate
  process with a new task-specific data directory.
- Disposable cluster identity: `ncv12r-202608121312426635`.
- Disposable database: `ncv12r_202608121312426635`.
- Listener: `127.0.0.1:56334` only. The port was unused before startup, the
  PostgreSQL setting `listen_addresses` was exactly `127.0.0.1`, and monitoring
  observed zero non-loopback connections during the rehearsal.
- Before migration the new database had zero public tables and no Drizzle
  schema. The cluster contained only the required system `postgres` database
  and the one task database; template databases were not counted as user
  databases.
- Synthetic PostgreSQL trust authentication was confined to the loopback-only
  disposable cluster. No credential or connection string was retained.

This proves the selected instance was newly initialized for this task rather
than development, staging, production, customer-facing or shared state.

## Migration method and ordering

The rehearsal harness used the installed repository dependencies and the
official `drizzle-orm/postgres-js/migrator` implementation against the existing
`packages/shared/drizzle` directory. This is the same PostgreSQL migration
engine used by the configured Drizzle production path.

1. A temporary journal containing entries `0000` through `0011` was assembled
   from the existing migration files without editing them.
2. The migrator created a clean supported pre-0012 state with exactly 12
   ordered journal rows. Both proposal-binding tables were absent.
3. An additional synthetic migration created a marker table and then failed on
   a deliberately missing relation. Drizzle's migration transaction rolled
   back the marker and its journal entry.
4. The unchanged production directory was passed to the migrator. Migration
   `0012_voice_proposal_binding` was applied, producing exactly 13 journal rows.
5. Every journal timestamp and SHA-256 matched the checked-in SQL and
   `_journal.json`; the final timestamp was `1786543200000`.
6. The repository's installed `drizzle-kit migrate` command was then run with
   its cache redirected to task-specific temporary storage. It completed
   successfully and left the journal idempotently at 13 rows.

Protected production artifacts remained byte-identical:

- Rehearsal harness SHA-256:
  `f52ad1a72d8f9fc3899eb460c81f61d305b6e2e8054dcf0f7786d2ece100c01e`
- `0012_voice_proposal_binding.sql` SHA-256:
  `38275431531042dace6d51e02421913c4d7ff4c867852004663cdb4b9b281024`
- Drizzle journal SHA-256:
  `830f54649b82c457d030db6fce4c65d7a14159d39d17f3802bd0597ae2e7ec4f`

## Schema and constraint results

PostgreSQL reported 21 columns, 17 constraints and 8 indexes across the two
new tables. Introspection verified every required data type, default and
nullability rule.

| Contract proof | Result |
|---|---|
| Four-field proposal primary key | PASS |
| Six-field proposal/owner/conversation/policy/token/binding uniqueness | PASS |
| Six-field confirmation foreign key | PASS |
| Global token-hash uniqueness | PASS; duplicate rejected with `23505` |
| Global token-binding-hash uniqueness | PASS; duplicate rejected with `23505` |
| Accepted-once partial unique index | PASS |
| Hash-length checks | PASS |
| Cancellation-state invariant | PASS; invalid row rejected with `23514` |
| Consumption-state invariant | PASS; invalid row rejected with `23514` |
| Pending lookup and owner/conversation indexes | PASS |

All six binding fields were mutated individually for both `accepted=false` and
`accepted=true`. PostgreSQL rejected all 12 rows with foreign-key error `23503`.
A matching rejected confirmation, matching accepted confirmation and repeated
rejected confirmation were retained; a second matching accepted confirmation
was rejected.

## Repository and concurrency results

Production repository functions were executed through Drizzle against the
disposable PostgreSQL database with synthetic 64-character hashes only.

- Exact proposal, owner/tenant, conversation, policy, token and binding lookups
  succeeded; all six individual query mutations returned no row.
- A tenant context with a different owner failed closed before query use.
- Expired and cancelled proposals could not be confirmed or consumed.
- Consumption before confirmation and after `accepted=false` returned no row.
- Consumption succeeded only after the exact persisted `accepted=true`
  confirmation, then replay returned no row.
- Two independent connections raced to persist the same accepted confirmation:
  exactly one succeeded and one was rejected.
- Two independent connections raced to consume one accepted proposal: exactly
  one completed it and one returned no row.
- Data persisted after all clients closed and a new connection opened.

## Rollback and restart

- Injected migration failure: rejected.
- Partial marker table after rollback: absent.
- Partial migration journal row after rollback: absent.
- Disposable process restart: PASS. The parent PostgreSQL PID changed from
  `44324` to `9652`; the log showed a clean fast shutdown, PostgreSQL 17.10
  startup and ready state.
- After restart: all 13 journal rows, all 21 columns, 17 constraints, 8 indexes
  and the synthetic pending proposal persisted.
- Network check after restart: loopback only.

## Teardown proof

The single task database was dropped first. A separate connection to the
system `postgres` database returned `false|postgres`, proving the task database
no longer existed and no other non-template database was present. The task
cluster was then stopped.

- PID `9652` absent after stop: PASS.
- Port `56334` released: PASS.
- Task data directory removed: PASS.
- Task PostgreSQL log removed: PASS.
- Task-local Drizzle cache removed: PASS.

## Verification

| Check | Result |
|---|---|
| Live disposable PostgreSQL rehearsal | PASS; prepare and restart phases |
| PostgreSQL mutation matrix | PASS; 6 fields x 2 accepted values = 12/12 rejected |
| PostgreSQL concurrency | PASS; 1 accepted + 1 rejected in both races |
| Focused verifier/tenant/disposable-SQLite tests | PASS; 3 files, 15 tests |
| Complete model-free voice suite | PASS; 10 files, 252 tests |
| Non-live WhatsApp release gate | PASS; receipt 168, smoke 300, capability 172, reply-shape 26 passed / 108 intentionally skipped |
| Complete applicable serial unit/integration suite | PASS; 240 files, 1,390 tests using isolated fork workers; protected one-shot V1/V1.1/V1.2 runners excluded |
| Workspace typecheck | PASS; shared, bot and dashboard |
| Lint | PASS; 0 errors, 5 unrelated pre-existing warnings |
| Production build | PASS; bot TypeScript and dashboard Next.js build |
| Historical V1/V1.1/V1.2 verification | PASS; 22 immutable files, 42 historical implementation blobs and 3 aggregates |
| V1.2 initial-result hash | PASS; `1b08a2b6fa00676d9b54e9ff058333b17f7592bfdcbaa202659fbff7534dc85e` |
| V1.2 repair-result hash | PASS; `38783d382d901c37a4ade8482e3e68728db047e3966e58be9db67371b6f6420f` |
| Focused Semgrep | Completed; 4 local rules, 1 harness target, 6 manually reviewed false positives, 0 true positives |
| Dependency manifest and lockfile validation | PASS; four local projects resolved, no manifest or lockfile diff |
| Focused secret scan | PASS; 7 high-confidence pattern families, 0 findings |
| `git diff --check` | PASS |

Semgrep's six findings were `Map.get` calls used to retrieve PostgreSQL
constraint metadata at harness lines 274, 277, 278, 279, 280 and 285. The broad
local network-client rule mistook `.get` for an HTTP client method. Manual
inspection confirmed zero HTTP, cloud, shell, child-process or external-action
primitive in the TypeScript harness. No suppression was added.

The first two harness preflights stopped before migration 0012 on evidence-only
assertion mechanics: PostgreSQL's textual host included a `/32` mask, and the
driver returned a custom `Result` array prototype. A later constraint preflight
found that the synthetic duplicate-token fixture had overwritten its intended
test mutation before insertion. No production defect was implicated. The same
single database was returned to an independently verified zero-table state,
the fixture was corrected, and the complete clean sequence above ran once.
An attempted `corepack` invocation after redirecting CLI cache was denied before
execution when Corepack tried to reach the npm registry; no download completed
and PostgreSQL was unchanged. The already-installed local Drizzle CLI was then
invoked directly.

## Files changed

- `packages/shared/test/voice-proposal-postgres-rehearsal.ts` — disposable
  PostgreSQL isolation, migration, schema, mutation, repository, concurrency,
  rollback and restart verifier.
- `docs/voice-verifier-v1.2-postgres-rehearsal-2026-08-12.md` — this sanitized
  evidence record.

Migration `0012`, its journal entry, every prior migration, production schema
and repository implementation, and every V1/V1.1/V1.2 frozen artifact/result
were not edited.

## Remaining risk

- This proves PostgreSQL 17.10 behavior in a fresh local isolated cluster. It
  does not prove a future managed runtime's exact PostgreSQL version, role
  grants, connection pool or operational backup/rollback process.
- The initial clean application used Drizzle's official PostgreSQL migrator;
  the repository `drizzle-kit migrate` wrapper subsequently proved idempotence
  against the same final state.
- No runtime database has migration 0012 applied by this task.
- No ASR quality, model or 216-clip release gate ran. Voice remains NO GO and
  voice-derived data still grants no external authority.

## Next bounded authorization

Authorize a read-only production-readiness review that maps the proven
PostgreSQL 17.10 contract to the actual runtime provider version, role grants,
backup and rollback controls without applying migration 0012 or contacting
customer data.
