import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";
import {
  cancelVoiceVerificationProposal,
  consumeVoiceVerificationProposal,
  expireVoiceVerificationProposal,
  getVoiceVerificationProposal,
  insertVoiceVerificationProposal,
  recordVoiceVerificationConfirmation,
  type VoiceVerificationProposalInsert,
  type VoiceVerificationProposalKey,
} from "../src/db/repo.js";
import * as schema from "../src/db/schema.js";
import { privateOwnerTenant, type TenantContext } from "../src/tenancy.js";
import { createVoiceProposalTokenHashes } from "../src/voice/proposal-binding.js";

type Phase = "prepare" | "restart";

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

interface RehearsalEnvironment {
  phase: Phase;
  databaseUrl: string;
  databaseName: string;
  taskId: string;
  port: number;
}

const repoRoot = resolve(import.meta.dirname, "../../..");
const migrationsDirectory = join(repoRoot, "packages/shared/drizzle");
const journalPath = join(migrationsDirectory, "meta/_journal.json");
const expectedLastMigration = "0012_voice_proposal_binding";
const expectedLastCreatedAt = 1_786_543_200_000;
const expectedDatabasePrefix = "ncv12r_";
const expectedTaskPrefix = "ncv12r-";
function requireEnvironment(): RehearsalEnvironment {
  const phase = process.argv[2];
  assert(phase === "prepare" || phase === "restart", "phase must be prepare or restart");
  assert(process.argv.length === 3, "the rehearsal accepts exactly one phase argument");

  const databaseUrl = process.env.NITSYCLAW_REHEARSAL_DATABASE_URL;
  const databaseName = process.env.NITSYCLAW_REHEARSAL_DATABASE;
  const taskId = process.env.NITSYCLAW_REHEARSAL_TASK_ID;
  const portText = process.env.NITSYCLAW_REHEARSAL_PORT;
  assert(databaseUrl, "the task-specific rehearsal database URL is required");
  assert(databaseName?.startsWith(expectedDatabasePrefix), "the task-specific database name is invalid");
  assert(/^[a-z0-9_]+$/u.test(databaseName), "the task-specific database name is unsafe");
  assert(taskId?.startsWith(expectedTaskPrefix), "the task-specific cluster identity is invalid");
  assert(/^[a-z0-9-]+$/u.test(taskId), "the task-specific cluster identity is unsafe");
  assert(portText && /^\d{4,5}$/u.test(portText), "the task-specific port is invalid");
  const port = Number(portText);
  assert(Number.isInteger(port) && port > 1024 && port < 65_536, "the task-specific port is out of range");

  return { phase, databaseUrl, databaseName, taskId, port };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function readJournal(): Journal {
  return JSON.parse(readFileSync(journalPath, "utf8")) as Journal;
}

function createMigrationSubset(entries: JournalEntry[], injectedFailure = false): string {
  const directory = mkdtempSync(join(tmpdir(), "nitsyclaw-voice-postgres-migrations-"));
  const metaDirectory = join(directory, "meta");
  mkdirSync(metaDirectory);
  for (const entry of entries) {
    copyFileSync(join(migrationsDirectory, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
  }
  const journal = readJournal();
  const subset: Journal = { ...journal, entries: [...entries] };
  if (injectedFailure) {
    const failure: JournalEntry = {
      idx: 12,
      version: "7",
      when: expectedLastCreatedAt - 1,
      tag: "0012_rehearsal_injected_failure",
      breakpoints: true,
    };
    subset.entries.push(failure);
    writeFileSync(
      join(directory, `${failure.tag}.sql`),
      [
        "CREATE TABLE voice_rehearsal_partial_marker (id integer PRIMARY KEY);",
        "--> statement-breakpoint",
        "SELECT * FROM voice_rehearsal_deliberately_missing_relation;",
      ].join("\n"),
      "utf8",
    );
  }
  writeFileSync(join(metaDirectory, "_journal.json"), `${JSON.stringify(subset, null, 2)}\n`, "utf8");
  return directory;
}

function pgCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : null;
}

async function expectPgError(promise: Promise<unknown>, code: string, label: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    assert.equal(pgCode(error), code, `${label} returned an unexpected PostgreSQL error class`);
    return;
  }
  assert.fail(`${label} was not rejected`);
}

async function assertIsolatedCluster(sql: Sql, env: RehearsalEnvironment) {
  const [identity] = await sql<{
    database_name: string;
    server_address: string;
    server_port: number;
    server_version: string;
    server_version_num: string;
    listen_addresses: string;
    data_directory: string;
  }[]>`
    SELECT
      current_database() AS database_name,
      host(inet_server_addr()) AS server_address,
      inet_server_port() AS server_port,
      current_setting('server_version') AS server_version,
      current_setting('server_version_num') AS server_version_num,
      current_setting('listen_addresses') AS listen_addresses,
      current_setting('data_directory') AS data_directory
  `;
  assert(identity, "PostgreSQL did not return cluster identity");
  assert.equal(identity.database_name, env.databaseName, "connected to the wrong database");
  assert.equal(identity.server_address, "127.0.0.1", "server is not loopback-only");
  assert.equal(Number(identity.server_port), env.port, "connected to the wrong PostgreSQL port");
  assert.equal(identity.listen_addresses, "127.0.0.1", "cluster listens beyond loopback");
  assert(
    basename(identity.data_directory).toLowerCase().includes(env.taskId.toLowerCase()),
    "cluster data directory is not task-specific",
  );
  const databases = await sql<{ datname: string }[]>`
    SELECT datname
    FROM pg_database
    WHERE datistemplate = false
    ORDER BY datname
  `;
  assert.deepEqual(
    databases.map(({ datname }) => datname),
    [env.databaseName, "postgres"].sort(),
    "cluster contains a non-task database",
  );
  return {
    databaseName: identity.database_name,
    serverAddress: identity.server_address,
    serverPort: Number(identity.server_port),
    serverVersion: identity.server_version,
    serverVersionNumber: identity.server_version_num,
    listenAddresses: identity.listen_addresses,
    dataDirectoryIdentity: basename(identity.data_directory),
    nonTemplateDatabases: databases.map(({ datname }) => datname),
  };
}

async function migrationRows(sql: Sql) {
  const rows = await sql<{ hash: string; created_at: string }[]>`
    SELECT hash, created_at::text
    FROM drizzle.__drizzle_migrations
    ORDER BY created_at
  `;
  return Array.from(rows, ({ hash, created_at }) => ({ hash, created_at }));
}

function expectedMigrationRows(entries: JournalEntry[]) {
  return entries.map((entry) => ({
    hash: sha256(readFileSync(join(migrationsDirectory, `${entry.tag}.sql`), "utf8")),
    created_at: String(entry.when),
  }));
}

async function verifySchema(sql: Sql) {
  const columns = await sql<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: "YES" | "NO";
    column_default: string | null;
  }[]>`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('voice_verification_proposals', 'voice_verification_confirmations')
    ORDER BY table_name, ordinal_position
  `;
  const expectedColumns: Record<string, [string, "YES" | "NO", RegExp | null]> = {
    "voice_verification_confirmations.attempt_id": ["uuid", "NO", /gen_random_uuid/u],
    "voice_verification_confirmations.proposal_id": ["text", "NO", null],
    "voice_verification_confirmations.owner_hash": ["text", "NO", null],
    "voice_verification_confirmations.conversation_hash": ["text", "NO", null],
    "voice_verification_confirmations.policy_version": ["text", "NO", null],
    "voice_verification_confirmations.token_hash": ["text", "NO", null],
    "voice_verification_confirmations.token_binding_hash": ["text", "NO", null],
    "voice_verification_confirmations.accepted": ["boolean", "NO", null],
    "voice_verification_confirmations.created_at": ["timestamp with time zone", "NO", /^now\(\)$/u],
    "voice_verification_proposals.proposal_id": ["text", "NO", null],
    "voice_verification_proposals.owner_hash": ["text", "NO", null],
    "voice_verification_proposals.conversation_hash": ["text", "NO", null],
    "voice_verification_proposals.policy_version": ["text", "NO", null],
    "voice_verification_proposals.token_hash": ["text", "NO", null],
    "voice_verification_proposals.token_binding_hash": ["text", "NO", null],
    "voice_verification_proposals.status": ["text", "NO", /'pending'::text/u],
    "voice_verification_proposals.expires_at": ["timestamp with time zone", "NO", null],
    "voice_verification_proposals.cancelled_at": ["timestamp with time zone", "YES", null],
    "voice_verification_proposals.consumed_at": ["timestamp with time zone", "YES", null],
    "voice_verification_proposals.created_at": ["timestamp with time zone", "NO", /^now\(\)$/u],
    "voice_verification_proposals.updated_at": ["timestamp with time zone", "NO", /^now\(\)$/u],
  };
  assert.equal(columns.length, Object.keys(expectedColumns).length, "voice schema column count changed");
  for (const column of columns) {
    const key = `${column.table_name}.${column.column_name}`;
    const expected = expectedColumns[key];
    assert(expected, `unexpected column ${key}`);
    assert.equal(column.data_type, expected[0], `${key} data type changed`);
    assert.equal(column.is_nullable, expected[1], `${key} nullability changed`);
    if (expected[2]) {
      assert(expected[2].test(column.column_default ?? ""), `${key} default changed`);
    } else {
      assert.equal(column.column_default, null, `${key} unexpectedly has a default`);
    }
  }

  const constraints = await sql<{ conname: string; contype: string; definition: string }[]>`
    SELECT conname, contype, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid IN (
      'public.voice_verification_proposals'::regclass,
      'public.voice_verification_confirmations'::regclass
    )
    ORDER BY conname
  `;
  const byName = new Map(constraints.map((constraint) => [constraint.conname, constraint]));
  const sixFields = [
    "proposal_id",
    "owner_hash",
    "conversation_hash",
    "policy_version",
    "token_hash",
    "token_binding_hash",
  ];
  const foreignKey = byName.get("voice_verification_confirmations_proposal_binding_fk");
  assert.equal(foreignKey?.contype, "f", "six-field confirmation foreign key is missing");
  for (const field of sixFields) assert(foreignKey?.definition.includes(field), `foreign key omits ${field}`);
  assert.equal(byName.get("voice_verification_proposals_identity_pk")?.contype, "p", "proposal identity PK is missing");
  assert.equal(byName.get("voice_verification_proposals_token_hash_unique")?.contype, "u", "token hash uniqueness is missing");
  assert.equal(byName.get("voice_verification_proposals_token_binding_hash_unique")?.contype, "u", "binding hash uniqueness is missing");
  assert.equal(byName.get("voice_verification_proposals_confirmation_identity_unique")?.contype, "u", "six-field uniqueness is missing");
  for (const checkName of [
    "voice_verification_proposals_cancelled_state_check",
    "voice_verification_proposals_consumed_state_check",
  ]) {
    assert.equal(byName.get(checkName)?.contype, "c", `${checkName} is missing`);
  }

  const indexes = await sql<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN ('voice_verification_proposals', 'voice_verification_confirmations')
    ORDER BY indexname
  `;
  const acceptedOnce = indexes.find(({ indexname }) => indexname === "voice_verification_confirmations_accepted_once_idx");
  assert(acceptedOnce?.indexdef.includes("WHERE (accepted = true)"), "accepted-once partial index is missing");
  const pendingLookup = indexes.find(({ indexname }) => indexname === "voice_verification_proposals_pending_lookup_idx");
  assert(pendingLookup, "pending proposal lookup index is missing");

  return {
    columnCount: columns.length,
    constraintCount: constraints.length,
    indexCount: indexes.length,
    sixFieldForeignKey: true,
    globalTokenHashUnique: true,
    acceptedOncePartialIndex: true,
  };
}

interface SyntheticBinding extends VoiceVerificationProposalKey {
  rawToken: string;
}

function makeBinding(label: string): SyntheticBinding {
  const identity = {
    proposalId: `synthetic-${label}`,
    ownerHash: sha256(`owner-${label}`),
    conversationHash: sha256(`conversation-${label}`),
    policyVersion: "NITSYCLAW-VOICE-VERIFIER-V1",
  };
  const rawToken = `synthetic-token-${label}`;
  return { ...identity, ...createVoiceProposalTokenHashes(identity, rawToken), rawToken };
}

async function insertRawProposal(sql: Sql, binding: VoiceVerificationProposalKey) {
  await sql`
    INSERT INTO voice_verification_proposals (
      proposal_id, owner_hash, conversation_hash, policy_version,
      token_hash, token_binding_hash, expires_at
    ) VALUES (
      ${binding.proposalId}, ${binding.ownerHash}, ${binding.conversationHash}, ${binding.policyVersion},
      ${binding.tokenHash}, ${binding.tokenBindingHash}, now() + interval '1 hour'
    )
  `;
}

async function insertRawConfirmation(
  sql: Sql,
  binding: VoiceVerificationProposalKey,
  accepted: boolean,
) {
  await sql`
    INSERT INTO voice_verification_confirmations (
      proposal_id, owner_hash, conversation_hash, policy_version,
      token_hash, token_binding_hash, accepted
    ) VALUES (
      ${binding.proposalId}, ${binding.ownerHash}, ${binding.conversationHash}, ${binding.policyVersion},
      ${binding.tokenHash}, ${binding.tokenBindingHash}, ${accepted}
    )
  `;
}

async function verifyDatabaseConstraints(sql: Sql) {
  const base = makeBinding("constraint-base");
  await insertRawProposal(sql, base);
  await insertRawConfirmation(sql, base, false);
  await insertRawConfirmation(sql, base, true);
  await insertRawConfirmation(sql, base, false);
  await expectPgError(insertRawConfirmation(sql, base, true), "23505", "duplicate accepted confirmation");

  const mutations: Array<[keyof VoiceVerificationProposalKey, string]> = [
    ["proposalId", "synthetic-other-proposal"],
    ["ownerHash", sha256("other-owner")],
    ["conversationHash", sha256("other-conversation")],
    ["policyVersion", "NITSYCLAW-VOICE-VERIFIER-OTHER"],
    ["tokenHash", sha256("other-token")],
    ["tokenBindingHash", sha256("other-binding")],
  ];
  let mismatchRejections = 0;
  for (const accepted of [false, true]) {
    for (const [field, value] of mutations) {
      await expectPgError(
        insertRawConfirmation(sql, { ...base, [field]: value }, accepted),
        "23503",
        `${field} mismatch for accepted=${String(accepted)}`,
      );
      mismatchRejections++;
    }
  }

  const duplicateToken = { ...makeBinding("duplicate-token"), tokenHash: base.tokenHash };
  await expectPgError(insertRawProposal(sql, duplicateToken), "23505", "global token-hash reuse");
  const duplicateBinding = { ...makeBinding("duplicate-binding"), tokenBindingHash: base.tokenBindingHash };
  await expectPgError(insertRawProposal(sql, duplicateBinding), "23505", "global binding-hash reuse");

  const invalidCancelled = makeBinding("invalid-cancelled-state");
  await expectPgError(
    sql`
      INSERT INTO voice_verification_proposals (
        proposal_id, owner_hash, conversation_hash, policy_version,
        token_hash, token_binding_hash, status, expires_at
      ) VALUES (
        ${invalidCancelled.proposalId}, ${invalidCancelled.ownerHash}, ${invalidCancelled.conversationHash},
        ${invalidCancelled.policyVersion}, ${invalidCancelled.tokenHash}, ${invalidCancelled.tokenBindingHash},
        'cancelled', now() + interval '1 hour'
      )
    `,
    "23514",
    "cancelled state without cancellation time",
  );
  const invalidConsumed = makeBinding("invalid-consumed-state");
  await expectPgError(
    sql`
      INSERT INTO voice_verification_proposals (
        proposal_id, owner_hash, conversation_hash, policy_version,
        token_hash, token_binding_hash, status, expires_at
      ) VALUES (
        ${invalidConsumed.proposalId}, ${invalidConsumed.ownerHash}, ${invalidConsumed.conversationHash},
        ${invalidConsumed.policyVersion}, ${invalidConsumed.tokenHash}, ${invalidConsumed.tokenBindingHash},
        'completed', now() + interval '1 hour'
      )
    `,
    "23514",
    "completed state without consumption time",
  );

  return {
    matchingAcceptedFalse: true,
    matchingAcceptedTrue: true,
    repeatRejectedConfirmationAllowed: true,
    duplicateAcceptedRejected: true,
    individualBindingMutations: mutations.length,
    acceptedValuesTested: 2,
    mismatchRejections,
    tokenHashReuseRejected: true,
    tokenBindingHashReuseRejected: true,
    stateConstraintRejections: 2,
  };
}

function asProposalInsert(binding: SyntheticBinding, expiresAt: Date): VoiceVerificationProposalInsert {
  return {
    proposalId: binding.proposalId,
    ownerHash: binding.ownerHash,
    conversationHash: binding.conversationHash,
    policyVersion: binding.policyVersion,
    tokenHash: binding.tokenHash,
    tokenBindingHash: binding.tokenBindingHash,
    expiresAt,
  };
}

function connect(url: string) {
  const sql = postgres(url, { max: 1, connect_timeout: 10, idle_timeout: 5, onnotice: () => undefined });
  return { sql, db: drizzle(sql, { schema }) };
}

async function verifyRepositoryContract(env: RehearsalEnvironment) {
  const primary = connect(env.databaseUrl);
  const independentA = connect(env.databaseUrl);
  const independentB = connect(env.databaseUrl);
  const now = new Date();
  const future = new Date(now.getTime() + 60 * 60 * 1_000);
  try {
    const consume = makeBinding("repo-consume");
    const consumeTenant = privateOwnerTenant(consume.ownerHash);
    await insertVoiceVerificationProposal(primary.db, consumeTenant, asProposalInsert(consume, future));
    assert.equal(await consumeVoiceVerificationProposal(primary.db, consumeTenant, consume, now), null);
    await recordVoiceVerificationConfirmation(primary.db, consumeTenant, { ...consume, accepted: false, createdAt: now });
    assert.equal(await consumeVoiceVerificationProposal(primary.db, consumeTenant, consume, now), null);
    await recordVoiceVerificationConfirmation(primary.db, consumeTenant, { ...consume, accepted: true, createdAt: now });
    const consumed = await consumeVoiceVerificationProposal(primary.db, consumeTenant, consume, now);
    assert.equal(consumed?.status, "completed", "accepted proposal was not consumed");
    assert.equal(await consumeVoiceVerificationProposal(primary.db, consumeTenant, consume, now), null);

    const cancelled = makeBinding("repo-cancelled");
    const cancelledTenant = privateOwnerTenant(cancelled.ownerHash);
    await insertVoiceVerificationProposal(primary.db, cancelledTenant, asProposalInsert(cancelled, future));
    assert.equal((await cancelVoiceVerificationProposal(primary.db, cancelledTenant, cancelled, now))?.status, "cancelled");
    await assert.rejects(
      recordVoiceVerificationConfirmation(primary.db, cancelledTenant, { ...cancelled, accepted: true, createdAt: now }),
      /binding is not usable/u,
    );
    assert.equal(await consumeVoiceVerificationProposal(primary.db, cancelledTenant, cancelled, now), null);

    const expired = makeBinding("repo-expired");
    const expiredTenant = privateOwnerTenant(expired.ownerHash);
    await insertVoiceVerificationProposal(
      primary.db,
      expiredTenant,
      asProposalInsert(expired, new Date(now.getTime() - 1_000)),
    );
    assert.equal((await expireVoiceVerificationProposal(primary.db, expiredTenant, expired, now))?.status, "expired");
    await assert.rejects(
      recordVoiceVerificationConfirmation(primary.db, expiredTenant, { ...expired, accepted: true, createdAt: now }),
      /binding is not usable/u,
    );
    assert.equal(await consumeVoiceVerificationProposal(primary.db, expiredTenant, expired, now), null);

    const scoped = makeBinding("repo-scope");
    const scopedTenant = privateOwnerTenant(scoped.ownerHash);
    await insertVoiceVerificationProposal(primary.db, scopedTenant, asProposalInsert(scoped, future));
    const queryMutations: Array<[keyof VoiceVerificationProposalKey, string]> = [
      ["proposalId", "synthetic-other-proposal"],
      ["ownerHash", sha256("other-repository-owner")],
      ["conversationHash", sha256("other-repository-conversation")],
      ["policyVersion", "NITSYCLAW-VOICE-VERIFIER-OTHER"],
      ["tokenHash", sha256("other-repository-token")],
      ["tokenBindingHash", sha256("other-repository-binding")],
    ];
    for (const [field, value] of queryMutations) {
      const key = { ...scoped, [field]: value };
      const tenant: TenantContext = field === "ownerHash" ? privateOwnerTenant(value) : scopedTenant;
      assert.equal(await getVoiceVerificationProposal(primary.db, tenant, key), null, `${field} crossed repository scope`);
    }
    await assert.rejects(
      getVoiceVerificationProposal(primary.db, privateOwnerTenant(sha256("wrong-tenant")), scoped),
      /owner does not match tenant context/u,
    );

    const concurrentConfirmation = makeBinding("concurrent-confirmation");
    const confirmationTenant = privateOwnerTenant(concurrentConfirmation.ownerHash);
    await insertVoiceVerificationProposal(
      primary.db,
      confirmationTenant,
      asProposalInsert(concurrentConfirmation, future),
    );
    const confirmationResults = await Promise.allSettled([
      recordVoiceVerificationConfirmation(independentA.db, confirmationTenant, {
        ...concurrentConfirmation,
        accepted: true,
        createdAt: now,
      }),
      recordVoiceVerificationConfirmation(independentB.db, confirmationTenant, {
        ...concurrentConfirmation,
        accepted: true,
        createdAt: now,
      }),
    ]);
    assert.equal(confirmationResults.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(confirmationResults.filter(({ status }) => status === "rejected").length, 1);

    const concurrentConsumption = makeBinding("concurrent-consumption");
    const consumptionTenant = privateOwnerTenant(concurrentConsumption.ownerHash);
    await insertVoiceVerificationProposal(primary.db, consumptionTenant, asProposalInsert(concurrentConsumption, future));
    await recordVoiceVerificationConfirmation(primary.db, consumptionTenant, {
      ...concurrentConsumption,
      accepted: true,
      createdAt: now,
    });
    const consumptionResults = await Promise.all([
      consumeVoiceVerificationProposal(independentA.db, consumptionTenant, concurrentConsumption, now),
      consumeVoiceVerificationProposal(independentB.db, consumptionTenant, concurrentConsumption, now),
    ]);
    assert.equal(consumptionResults.filter(Boolean).length, 1);
    assert.equal(consumptionResults.filter((result) => result === null).length, 1);

    const restartBinding = makeBinding("restart-persistence");
    await insertVoiceVerificationProposal(
      primary.db,
      privateOwnerTenant(restartBinding.ownerHash),
      asProposalInsert(restartBinding, future),
    );

    return {
      consumeBeforeConfirmationRejected: true,
      consumeAfterRejectedConfirmationRejected: true,
      exactAcceptedConsumedOnce: true,
      consumptionReplayRejected: true,
      cancellationEnforced: true,
      expiryEnforced: true,
      repositoryMutationRejections: queryMutations.length,
      crossTenantOwnerRejected: true,
      concurrentAcceptedFulfilled: 1,
      concurrentAcceptedRejected: 1,
      concurrentConsumptionFulfilled: 1,
      concurrentConsumptionRejected: 1,
      restartProposalIdHash: sha256(restartBinding.proposalId),
    };
  } finally {
    await Promise.all([primary.sql.end(), independentA.sql.end(), independentB.sql.end()]);
  }
}

async function prepare(env: RehearsalEnvironment) {
  const sql = postgres(env.databaseUrl, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
    onnotice: () => undefined,
  });
  const temporaryDirectories: string[] = [];
  try {
    const isolation = await assertIsolatedCluster(sql, env);
    const journal = readJournal();
    assert.equal(journal.version, "7");
    assert.equal(journal.dialect, "postgresql");
    assert.equal(journal.entries.length, 13, "migration journal entry count changed");
    assert.deepEqual(journal.entries.map(({ idx }) => idx), Array.from({ length: 13 }, (_, index) => index));
    assert.equal(journal.entries.at(-1)?.tag, expectedLastMigration);
    assert.equal(journal.entries.at(-1)?.when, expectedLastCreatedAt);

    const pre0012Entries = journal.entries.filter(({ idx }) => idx <= 11);
    const pre0012Directory = createMigrationSubset(pre0012Entries);
    temporaryDirectories.push(pre0012Directory);
    await migrate(drizzle(sql), { migrationsFolder: pre0012Directory });
    const preTables = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('voice_verification_proposals', 'voice_verification_confirmations')
    `;
    assert.equal(preTables[0]?.count, "0", "0012 schema exists in the pre-0012 state");
    const preRows = await migrationRows(sql);
    assert.deepEqual(preRows, expectedMigrationRows(pre0012Entries), "pre-0012 journal is incorrect");

    const injectedDirectory = createMigrationSubset(pre0012Entries, true);
    temporaryDirectories.push(injectedDirectory);
    await assert.rejects(migrate(drizzle(sql), { migrationsFolder: injectedDirectory }));
    const partialTable = await sql<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'voice_rehearsal_partial_marker'
    `;
    assert.equal(partialTable.length, 0, "injected migration left partial schema state");
    assert.deepEqual(await migrationRows(sql), preRows, "injected migration left partial journal state");

    await migrate(drizzle(sql), { migrationsFolder: migrationsDirectory });
    const finalRows = await migrationRows(sql);
    assert.deepEqual(finalRows, expectedMigrationRows(journal.entries), "production migration journal is incorrect");
    const schemaProof = await verifySchema(sql);
    const constraintProof = await verifyDatabaseConstraints(sql);
    await sql.end();

    const repositoryProof = await verifyRepositoryContract(env);
    const reopened = postgres(env.databaseUrl, {
      max: 1,
      connect_timeout: 10,
      idle_timeout: 5,
      onnotice: () => undefined,
    });
    try {
      const persisted = await reopened<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM voice_verification_proposals
        WHERE proposal_id = 'synthetic-restart-persistence'
      `;
      assert.equal(persisted[0]?.count, "1", "proposal did not persist across closed and reopened connections");
    } finally {
      await reopened.end();
    }

    return {
      schemaVersion: "NITSYCLAW-VOICE-VERIFIER-V1.2-POSTGRES-REHEARSAL-1",
      phase: "prepare",
      success: true,
      isolation,
      migration: {
        productionMechanism: "drizzle-orm/postgres-js/migrator",
        pre0012Entries: preRows.length,
        finalEntries: finalRows.length,
        orderedJournalVerified: true,
        migrationHashesVerified: true,
        injectedFailureRejected: true,
        injectedSchemaRolledBack: true,
        injectedJournalRolledBack: true,
      },
      schema: schemaProof,
      constraints: constraintProof,
      repository: repositoryProof,
      connectionReopenPersistence: true,
      externalActionAllowed: false,
    };
  } finally {
    for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
}

async function verifyAfterRestart(env: RehearsalEnvironment) {
  const sql = postgres(env.databaseUrl, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
    onnotice: () => undefined,
  });
  try {
    const isolation = await assertIsolatedCluster(sql, env);
    const journal = readJournal();
    assert.deepEqual(await migrationRows(sql), expectedMigrationRows(journal.entries), "migration journal changed after restart");
    const persisted = await sql<{ status: string; count: string }[]>`
      SELECT status, count(*)::text AS count
      FROM voice_verification_proposals
      WHERE proposal_id = 'synthetic-restart-persistence'
      GROUP BY status
    `;
    assert.deepEqual(
      Array.from(persisted, ({ status, count }) => ({ status, count })),
      [{ status: "pending", count: "1" }],
      "proposal did not persist across process restart",
    );
    const schemaProof = await verifySchema(sql);
    return {
      schemaVersion: "NITSYCLAW-VOICE-VERIFIER-V1.2-POSTGRES-REHEARSAL-1",
      phase: "restart",
      success: true,
      isolation,
      migrationEntries: journal.entries.length,
      migrationJournalPersisted: true,
      proposalPersisted: true,
      schemaPersisted: schemaProof,
      externalActionAllowed: false,
    };
  } finally {
    await sql.end({ timeout: 1 });
  }
}

function sanitizedFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "unknown rehearsal failure";
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/giu, "[redacted-database-url]")
    .replace(/[a-f0-9]{64}/giu, "[synthetic-sha256]")
    .slice(0, 500);
}

async function main() {
  const env = requireEnvironment();
  const result = env.phase === "prepare" ? await prepare(env) : await verifyAfterRestart(env);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ success: false, error: sanitizedFailure(error) })}\n`);
  process.exitCode = 1;
});
