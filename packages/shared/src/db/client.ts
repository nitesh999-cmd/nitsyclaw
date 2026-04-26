import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type DB = ReturnType<typeof drizzle<typeof schema>>;

let cached: DB | null = null;

/**
 * Get a Drizzle client. Reuses connection in serverless-safe way.
 * Pass a custom URL for migrations / tests.
 */
export function getDb(url?: string): DB {
  if (cached && !url) return cached;
  const connectionString = url ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to construct DB client");
  }
  const client = postgres(connectionString, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  const db = drizzle(client, { schema });
  if (!url) cached = db;
  return db;
}

export function resetDbCache(): void {
  cached = null;
}
