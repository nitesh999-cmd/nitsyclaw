import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const RAILWAY_RELEVANT_PATHS = [
  "apps/bot/",
  "packages/shared/",
  "Dockerfile",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "railway.json",
  "scripts/docker-entrypoint.sh",
] as const;

export function isRailwayRelevantPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return RAILWAY_RELEVANT_PATHS.some((item) => (
    item.endsWith("/")
      ? normalized.startsWith(item)
      : normalized === item
  ));
}

export function railwayTokenGate(args: {
  token?: string;
  changedFiles: string[];
}): { configured: boolean; relevantFiles: string[]; shouldFail: boolean; message: string } {
  const configured = Boolean(args.token?.trim());
  const relevantFiles = args.changedFiles.filter(isRailwayRelevantPath);
  if (configured) {
    return {
      configured: true,
      relevantFiles,
      shouldFail: false,
      message: "RAILWAY_TOKEN is configured; live Railway WhatsApp proof can run.",
    };
  }
  if (relevantFiles.length === 0) {
    return {
      configured: false,
      relevantFiles,
      shouldFail: false,
      message: "RAILWAY_TOKEN is not configured, but this push did not touch Railway WhatsApp worker files.",
    };
  }
  return {
    configured: false,
    relevantFiles,
    shouldFail: true,
    message: "RAILWAY_TOKEN is required because this push touched Railway WhatsApp worker files.",
  };
}

function changedFilesFromGit(): string[] {
  const output = execFileSync("git", ["diff", "--name-only", "HEAD^", "HEAD"], { encoding: "utf8" });
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function writeGithubOutput(configured: boolean): void {
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (!githubOutput) return;
  appendFileSync(githubOutput, `configured=${configured ? "true" : "false"}\n`, "utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const changedFiles = process.argv.slice(2);
  const result = railwayTokenGate({
    token: process.env.RAILWAY_TOKEN,
    changedFiles: changedFiles.length > 0 ? changedFiles : changedFilesFromGit(),
  });

  writeGithubOutput(result.configured);
  if (result.shouldFail) {
    console.error(`::error::${result.message}`);
    console.error("Relevant files:");
    for (const file of result.relevantFiles) console.error(`- ${file}`);
    console.error("Add repository secret RAILWAY_TOKEN or avoid auto-deploying worker changes.");
    process.exit(1);
  }

  const annotation = result.configured ? "notice" : "warning";
  console.log(`::${annotation}::${result.message}`);
  if (result.relevantFiles.length > 0) {
    console.log("Relevant files:");
    for (const file of result.relevantFiles) console.log(`- ${file}`);
  }
}
