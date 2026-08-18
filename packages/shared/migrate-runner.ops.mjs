/**
 * NitsyClaw production migration runner — OPS SCRIPT (not part of the build).
 *
 * Exists because four things drizzle-kit does not do are required here:
 *
 *  1. Timeouts. Supavisor SILENTLY IGNORES the libpq `options` startup
 *     parameter, so `?options=-c lock_timeout=...` does NOT take effect through
 *     the pooler (proven against production: lock_timeout came back 0, not the
 *     requested 5000). The only mechanism that works is an explicit SET on the
 *     migration connection, which means owning the connection rather than
 *     letting drizzle-kit open its own. The SET results are then asserted, not
 *     merely printed — a value that did not take is a hard abort.
 *
 *  2. A lock. drizzle-orm 0.45.2 `PgDialect.migrate()` contains no advisory
 *     lock; it reads the journal, then applies. Two concurrent runs from the
 *     same journal state could both apply and double-insert. One operator
 *     process is the policy; this lock enforces it mechanically.
 *
 *  3. A real refusal of the wrong connection class. `selectMigrationDatabaseUrl()`
 *     validates URL shape but does not check the port. Session-scoped SET through
 *     the 6543 transaction pooler would contaminate pooled server connections,
 *     and the advisory lock would not be held for the session it protects. This
 *     parses the URL and enforces the approved port and sslmode instead of
 *     pattern-matching a substring.
 *
 *  4. Verification that the connection is what was claimed, before any DDL runs.
 *
 * Usage (single operator process, never in CI, never on container boot):
 *   DATABASE_URL_DIRECT="<session pooler :5432 ...?sslmode=require>" \
 *     node packages/shared/migrate-runner.ops.mjs
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const LOCK_KEY = 82134471; // arbitrary, stable, NitsyClaw migrations only
const REQUIRED_PORT = "5432";
/** `require` or stronger. Anything weaker is a downgrade, not a variation. */
const ACCEPTED_SSLMODES = new Set(["require", "verify-ca", "verify-full"]);
const SENTINEL_TABLE = "nitsyclaw_rehearsal_sentinel";
const SENTINEL_TOKEN = "nitsyclaw-disposable-clone-do-not-create-in-production";
const LOCK_TIMEOUT = "5s";
const STATEMENT_TIMEOUT = "300s";
/** What `current_setting` must return once the SETs have run. */
const EXPECT_LOCK_TIMEOUT = "5s";
const EXPECT_STATEMENT_TIMEOUT = "5min";

const raw = process.env.DATABASE_URL_DIRECT?.trim();
if (!raw) throw new Error("DATABASE_URL_DIRECT is required");

// Parse rather than substring-match: a transaction-pooler URL in a different
// shape would slip past an `includes(":6543/")` test.
let parsed;
try {
  parsed = new URL(raw);
} catch {
  throw new Error("DATABASE_URL_DIRECT is not a valid URL");
}
if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
  throw new Error(`Refusing to migrate: unexpected protocol ${parsed.protocol}`);
}

/**
 * Rehearsal against a disposable local clone.
 *
 * A runner that cannot be rehearsed is its own safety defect: the connection
 * rules below would otherwise force every rehearsal to exercise a *different*
 * code path than production, which is exactly how a runner ships untested.
 *
 * Gated twice, because one gate was not enough. A loopback address alone is NOT
 * proof of a disposable database: a TCP proxy, an SSH tunnel or a doctored hosts
 * entry can make production answer on 127.0.0.1, and the relaxation would then
 * skip the port, TLS and server-port checks against the real thing. So the flag
 * requires a loopback address AND an independently created sentinel table that
 * only the clone-restore procedure makes and that must never exist in
 * Production. Both, or no relaxation.
 */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const rehearsalRequested = process.env.NITSYCLAW_MIGRATION_REHEARSAL === "1";
const rehearsal = rehearsalRequested && LOOPBACK.has(parsed.hostname);
if (rehearsalRequested && !rehearsal) {
  throw new Error(
    `Refusing to migrate: NITSYCLAW_MIGRATION_REHEARSAL=1 is only honoured for a loopback host, got "${parsed.hostname}".`,
  );
}

if (!rehearsal) {
  if (parsed.port !== REQUIRED_PORT) {
    throw new Error(
      `Refusing to migrate: port must be ${REQUIRED_PORT} (session pooler), got "${parsed.port || "<unset>"}". ` +
        "The 6543 transaction pooler would break both session SET and the advisory lock.",
    );
  }
  // getAll, not get: a URL may carry `sslmode` twice, and this driver reduces
  // duplicates to the LAST value while `get()` returns the FIRST. Checking the
  // first would let `?sslmode=require&sslmode=disable` pass with TLS off.
  const sslModes = parsed.searchParams.getAll("sslmode");
  if (sslModes.length !== 1) {
    throw new Error(
      `Refusing to migrate: exactly one sslmode parameter is required, found ${sslModes.length}.`,
    );
  }
  if (!ACCEPTED_SSLMODES.has(sslModes[0])) {
    throw new Error(
      `Refusing to migrate: sslmode must be one of ${[...ACCEPTED_SSLMODES].join(", ")}, got "${sslModes[0]}".`,
    );
  }
} else {
  console.log("REHEARSAL=1 loopback host — connection-class checks relaxed pending sentinel verification");
}

const sql = postgres(raw, { max: 1, prepare: false, onnotice: () => {} });
let locked = false;

try {
  // The sentinel is the independent half of the rehearsal gate. A loopback
  // address alone is not proof: a TCP proxy, SSH tunnel or a doctored hosts
  // entry can make production answer on 127.0.0.1. This table is created by the
  // clone-restore procedure AFTER restoring, and must never exist in Production,
  // so a tunnelled production database fails the check even though the address
  // looked local.
  if (rehearsal) {
    const [sentinel] = await sql`
      SELECT token FROM ${sql(SENTINEL_TABLE)} LIMIT 1`.catch(() => [undefined]);
    if (!sentinel || sentinel.token !== SENTINEL_TOKEN) {
      throw new Error(
        `Refusing to migrate: NITSYCLAW_MIGRATION_REHEARSAL=1 requires the ${SENTINEL_TABLE} marker, ` +
          "which only a disposable clone has. A loopback address is not sufficient proof on its own.",
      );
    }
    console.log("rehearsal_sentinel=verified");
  }

  // Explicit SET, not startup options: the pooler drops startup options.
  await sql.unsafe(`SET lock_timeout = '${LOCK_TIMEOUT}'`);
  await sql.unsafe(`SET statement_timeout = '${STATEMENT_TIMEOUT}'`);
  const [shown] = await sql`
    SELECT current_setting('lock_timeout') AS lock_timeout,
           current_setting('statement_timeout') AS statement_timeout,
           inet_server_port()::text AS port`;
  // Assert, do not merely report: if the pooler swallowed these, abort before DDL.
  if (shown.lock_timeout !== EXPECT_LOCK_TIMEOUT || shown.statement_timeout !== EXPECT_STATEMENT_TIMEOUT) {
    throw new Error(
      `Refusing to migrate: timeouts did not take effect (lock_timeout=${shown.lock_timeout}, ` +
        `statement_timeout=${shown.statement_timeout}).`,
    );
  }
  if (!rehearsal && shown.port !== REQUIRED_PORT) {
    throw new Error(`Refusing to migrate: server reports port ${shown.port}, expected ${REQUIRED_PORT}.`);
  }
  console.log(
    `preflight_ok port=${shown.port} lock_timeout=${shown.lock_timeout} statement_timeout=${shown.statement_timeout}`,
  );

  const [{ ok }] = await sql`SELECT pg_try_advisory_lock(${LOCK_KEY}) AS ok`;
  if (!ok) throw new Error("Another migration process holds the advisory lock. Exactly one is allowed.");
  locked = true;
  console.log("advisory_lock=acquired");

  await migrate(drizzle(sql), { migrationsFolder: "packages/shared/drizzle" });
  console.log("migrate=ok");
} finally {
  if (locked) {
    await sql`SELECT pg_advisory_unlock(${LOCK_KEY})`;
    console.log("advisory_lock=released");
  }
  await sql.end();
}
