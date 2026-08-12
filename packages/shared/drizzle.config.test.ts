import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

const directUrl = "postgresql://migration_user:direct_secret@127.0.0.1:5432/migration_db";
const pooledUrl = "postgresql://runtime_user:pooled_secret@127.0.0.1:6543/runtime_db";
const originalDirect = process.env.DATABASE_URL_DIRECT;
const originalPooled = process.env.DATABASE_URL;

async function importMigrationConfig(): Promise<typeof import("./drizzle.config.js")> {
  process.env.DATABASE_URL_DIRECT = directUrl;
  process.env.DATABASE_URL = pooledUrl;
  try {
    return await import("./drizzle.config.js");
  } finally {
    if (originalDirect === undefined) delete process.env.DATABASE_URL_DIRECT;
    else process.env.DATABASE_URL_DIRECT = originalDirect;
    if (originalPooled === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalPooled;
  }
}

const migrationConfigModule = await importMigrationConfig();

const { default: migrationConfig, selectMigrationDatabaseUrl } = migrationConfigModule;

afterEach(() => {
  expect(process.env.DATABASE_URL_DIRECT).toBe(originalDirect);
  expect(process.env.DATABASE_URL).toBe(originalPooled);
});

describe("Drizzle migration database configuration", () => {
  it("selects DATABASE_URL_DIRECT when both direct and pooled URLs are present", () => {
    expect(selectMigrationDatabaseUrl({ DATABASE_URL_DIRECT: directUrl })).toBe(directUrl);
    expect((migrationConfig.dbCredentials as { url: string }).url).toBe(directUrl);
  });

  it("selects DATABASE_URL_DIRECT when it is the only database URL", () => {
    expect(selectMigrationDatabaseUrl({ DATABASE_URL_DIRECT: directUrl })).toBe(directUrl);
  });

  it("fails closed when only the pooled DATABASE_URL is present", () => {
    const environment = { DATABASE_URL: pooledUrl } as NodeJS.ProcessEnv;
    expect(() => selectMigrationDatabaseUrl(environment)).toThrow(
      "DATABASE_URL_DIRECT is required for migration commands; pooled DATABASE_URL is not accepted.",
    );
  });

  it("fails closed when neither database URL is present", () => {
    expect(() => selectMigrationDatabaseUrl({})).toThrow(
      "DATABASE_URL_DIRECT is required for migration commands; pooled DATABASE_URL is not accepted.",
    );
  });

  it("fails closed when DATABASE_URL_DIRECT is blank", () => {
    expect(() => selectMigrationDatabaseUrl({ DATABASE_URL_DIRECT: "  " })).toThrow(
      "DATABASE_URL_DIRECT is required for migration commands; pooled DATABASE_URL is not accepted.",
    );
  });

  it("fails closed before connection for malformed direct URLs", () => {
    for (const value of [
      "not-a-url",
      "https://migration_user:direct_secret@127.0.0.1/migration_db",
      "postgresql:///migration_db",
      "postgresql://127.0.0.1:5432/",
      "postgresql://migration_user@127.0.0.1:5432",
    ]) {
      expect(() => selectMigrationDatabaseUrl({ DATABASE_URL_DIRECT: value })).toThrow(
        "DATABASE_URL_DIRECT must be a valid PostgreSQL connection URL.",
      );
    }
  });

  it("never includes secret-bearing values in configuration errors", () => {
    const secretBearingValues = ["direct_secret", "pooled_secret", directUrl, pooledUrl];
    for (const environment of [
      { DATABASE_URL_DIRECT: "not-a-url", DATABASE_URL: pooledUrl },
      { DATABASE_URL: pooledUrl },
    ] as NodeJS.ProcessEnv[]) {
      let message = "";
      try {
        selectMigrationDatabaseUrl(environment);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).not.toBe("");
      for (const secret of secretBearingValues) expect(message).not.toContain(secret);
    }
  });

  it("leaves runtime application database selection on DATABASE_URL", () => {
    const runtimeClient = readFileSync("packages/shared/src/db/client.ts", "utf8");
    expect(runtimeClient).toContain("url ?? process.env.DATABASE_URL");
    expect(runtimeClient).not.toContain("process.env.DATABASE_URL_DIRECT");
  });
});
