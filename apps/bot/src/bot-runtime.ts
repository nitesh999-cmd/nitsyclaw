import { hostname } from "node:os";
import { execFileSync } from "node:child_process";

export interface BotRuntimeMetadata extends Record<string, unknown> {
  platform: "railway" | "local";
  runtimeOwner: string;
  runtimeId: string;
  commit: string;
  commitShort: string;
  commitSource: "railway" | "git" | "unavailable";
  commitReason?: string;
  deploymentId?: string;
  environmentId?: string;
  serviceId?: string;
  startedAt: string;
  nodeVersion: string;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 120) : undefined;
}

export function buildBotRuntimeMetadata(
  env: NodeJS.ProcessEnv,
  now = new Date(),
  options: { resolveGitCommit?: () => string | undefined } = {},
): BotRuntimeMetadata {
  const railwayCommit = clean(env.RAILWAY_GIT_COMMIT_SHA);
  const resolveGitCommit = options.resolveGitCommit ?? (() => {
    try {
      return clean(execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 2_000,
      }));
    } catch {
      return undefined;
    }
  });
  const gitCommit = railwayCommit ? undefined : resolveGitCommit();
  const commit = railwayCommit ?? gitCommit ?? "unavailable";
  const commitSource: BotRuntimeMetadata["commitSource"] = railwayCommit
    ? "railway"
    : gitCommit
      ? "git"
      : "unavailable";
  const deploymentId = clean(env.RAILWAY_DEPLOYMENT_ID);
  const environmentId = clean(env.RAILWAY_ENVIRONMENT_ID);
  const serviceId = clean(env.RAILWAY_SERVICE_ID);
  const platform = environmentId || deploymentId ? "railway" : "local";
  const runtimeOwner = clean(env.NITSYCLAW_RUNTIME_OWNER) ?? platform;
  const runtimeId = clean(env.NITSYCLAW_RUNTIME_ID)
    ?? `${platform}:${deploymentId ?? hostname()}:${process.pid}`;
  const metadata: BotRuntimeMetadata = {
    platform,
    runtimeOwner,
    runtimeId,
    commit,
    commitShort: commit === "unavailable" ? "unavailable" : commit.slice(0, 7),
    commitSource,
    startedAt: now.toISOString(),
    nodeVersion: process.version,
  };

  if (deploymentId) metadata.deploymentId = deploymentId;
  if (environmentId) metadata.environmentId = environmentId;
  if (serviceId) metadata.serviceId = serviceId;
  if (commitSource === "unavailable") {
    metadata.commitReason = "No deployment SHA was provided and the runtime is outside a readable Git worktree.";
  }

  return metadata;
}
