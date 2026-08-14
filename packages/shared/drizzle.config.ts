import type { Config } from "drizzle-kit";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Load .env.local from the monorepo root
config({
  path: fileURLToPath(new URL("../../.env.local", import.meta.url)),
  quiet: true,
});

const requiredMessage =
  "DATABASE_URL_DIRECT is required for migration commands; pooled DATABASE_URL is not accepted.";
const invalidMessage =
  "DATABASE_URL_DIRECT must be a valid PostgreSQL connection URL.";

export function selectMigrationDatabaseUrl(
  environment: Readonly<{ DATABASE_URL_DIRECT?: string }>,
): string {
  const value = environment.DATABASE_URL_DIRECT?.trim();
  if (!value) {
    throw new Error(requiredMessage);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(invalidMessage);
  }

  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol)
    || !parsed.hostname
    || !parsed.username
    || !parsed.pathname
    || parsed.pathname === "/"
  ) {
    throw new Error(invalidMessage);
  }

  return value;
}

const url = selectMigrationDatabaseUrl(process.env);

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
} satisfies Config;
