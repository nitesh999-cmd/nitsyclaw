import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("command jobs migrations", () => {
  it("registers the unique dedupe migration in Drizzle journal", () => {
    const sql = readFileSync("packages/shared/drizzle/0008_unique_command_job_dedupe.sql", "utf8");
    const journal = readFileSync("packages/shared/drizzle/meta/_journal.json", "utf8");

    expect(sql).toContain("CREATE UNIQUE INDEX");
    expect(sql).toContain("command_jobs_dedupe_idx");
    expect(journal).toContain("0008_unique_command_job_dedupe");
  });
});
