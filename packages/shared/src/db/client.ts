import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type DB = ReturnType<typeof drizzle<typeof schema>>;

interface CachedClient {
  db: DB;
  client: postgres.Sql;
}

/**
 * Clients keyed by their exact connection string.
 *
 * The key is only ever used for lookup — it is never logged, returned, or
 * surfaced. Keying by URL (rather than a single slot) means repeated calls with
 * the same URL share one pool, while a different URL can never be handed the
 * wrong client. The previous single-slot cache skipped both the read and the
 * write whenever an explicit URL was passed, so every such call silently built
 * another pool.
 */
const clients = new Map<string, CachedClient>();

/**
 * Get a Drizzle client. Reuses the pool for a given connection string.
 * Pass a custom URL for migrations / tests.
 */
export function getDb(url?: string): DB {
  const connectionString = url ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to construct DB client");
  }
  const existing = clients.get(connectionString);
  if (existing) return existing.db;

  const client = postgres(connectionString, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  const db = drizzle(client, { schema });
  clients.set(connectionString, { db, client });
  return db;
}

/**
 * Close every cached client exactly once, then forget them.
 *
 * The map is cleared before any close is awaited, so concurrent or repeated
 * calls cannot close the same client twice; a second call simply finds nothing
 * to do. Individual close failures are swallowed — shutdown must not be blocked
 * by a socket that has already gone away.
 */
export async function closeDb(): Promise<void> {
  const cached = [...clients.values()];
  clients.clear();
  await Promise.all(
    cached.map((entry) => entry.client.end({ timeout: 5 }).catch(() => undefined)),
  );
}

/**
 * Drop cached references without closing them. Test helper only — production
 * shutdown should call closeDb() so the sockets are actually released.
 */
export function resetDbCache(): void {
  clients.clear();
}
