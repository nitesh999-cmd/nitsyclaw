import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The migration runner's refusals, exercised as refusals.
 *
 * Every case here aborts before a connection is attempted or before any DDL
 * runs, so none of them needs a database. The point is that the runner says no
 * to the wrong connection class rather than trusting the operator to pass the
 * right string at 2am.
 */

const RUNNER = "packages/shared/migrate-runner.ops.mjs";

function runWith(env: Record<string, string>): string {
  try {
    execFileSync(process.execPath, [RUNNER], {
      env: { ...process.env, ...env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });
    return "<no refusal>";
  } catch (error) {
    const e = error as { stderr?: string; stdout?: string; message?: string };
    return `${e.stderr ?? ""}${e.stdout ?? ""}${e.message ?? ""}`;
  }
}

describe("migration runner connection-class refusals", () => {
  it("refuses the transaction pooler", () => {
    expect(runWith({ DATABASE_URL_DIRECT: "postgresql://u:p@h:6543/db?sslmode=require" })).toMatch(
      /port must be 5432/u,
    );
  });

  it("refuses a missing sslmode", () => {
    expect(runWith({ DATABASE_URL_DIRECT: "postgresql://u:p@h:5432/db" })).toMatch(
      /exactly one sslmode parameter/u,
    );
  });

  it("refuses a DUPLICATED sslmode, where the driver would take the last value", () => {
    // `searchParams.get()` returns the FIRST value; postgres.js reduces query
    // parameters to the LAST. Checking the first would pass this URL with TLS
    // disabled, which is exactly the bypass this asserts against.
    expect(
      runWith({ DATABASE_URL_DIRECT: "postgresql://u:p@h:5432/db?sslmode=require&sslmode=disable" }),
    ).toMatch(/exactly one sslmode parameter is required, found 2/u);
  });

  it("refuses a weakened sslmode", () => {
    expect(runWith({ DATABASE_URL_DIRECT: "postgresql://u:p@h:5432/db?sslmode=prefer" })).toMatch(
      /sslmode must be one of/u,
    );
  });

  it("refuses rehearsal mode against a non-loopback host", () => {
    expect(
      runWith({
        DATABASE_URL_DIRECT: "postgresql://u:p@db.example.com:6543/db",
        NITSYCLAW_MIGRATION_REHEARSAL: "1",
      }),
    ).toMatch(/only honoured for a loopback host/u);
  });

  it("requires the sentinel as well as loopback before relaxing anything", () => {
    // A loopback address is not proof of a disposable database: a tunnel or a
    // doctored hosts entry can put production behind 127.0.0.1. Nothing is
    // listening on this port, so the run fails — the assertion is that the
    // source demands a sentinel at all, and that it is checked before the SETs.
    const source = readFileSync(RUNNER, "utf8");
    expect(source).toContain("nitsyclaw_rehearsal_sentinel");
    expect(source).toMatch(/requires the \$\{SENTINEL_TABLE\} marker/u);
    const sentinelAt = source.indexOf("if (rehearsal) {");
    const setAt = source.indexOf("SET lock_timeout");
    const migrateAt = source.indexOf("await migrate(");
    expect(sentinelAt).toBeGreaterThan(-1);
    expect(setAt).toBeGreaterThan(sentinelAt);
    expect(migrateAt).toBeGreaterThan(sentinelAt);
  });
});
