import type { Config } from "drizzle-kit";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local from the monorepo root
config({ path: resolve(__dirname, "../../.env.local") });

const url = process.env.DATABASE_URL ?? process.env.DATABASE_URL_DIRECT;
if (!url) {
  throw new Error(
    "DATABASE_URL_DIRECT (or DATABASE_URL) not found. Check .env.local at repo root.",
  );
}

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
} satisfies Config;