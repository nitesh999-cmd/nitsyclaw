export interface DashboardRuntimeMetadata extends Record<string, unknown> {
  platform: "vercel" | "unknown";
  environment: string;
  commit: string;
  commitShort: string;
  deploymentId?: string;
  url?: string;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 120) : undefined;
}

export function buildDashboardRuntimeMetadata(env: Record<string, string | undefined>): DashboardRuntimeMetadata {
  const commit = clean(env.VERCEL_GIT_COMMIT_SHA) ?? "unknown";
  const metadata: DashboardRuntimeMetadata = {
    platform: env.VERCEL || env.VERCEL_ENV ? "vercel" : "unknown",
    environment: clean(env.VERCEL_ENV) ?? "unknown",
    commit,
    commitShort: commit === "unknown" ? "unknown" : commit.slice(0, 7),
  };

  const deploymentId = clean(env.VERCEL_DEPLOYMENT_ID);
  const url = clean(env.VERCEL_URL);

  if (deploymentId) metadata.deploymentId = deploymentId;
  if (url) metadata.url = url;

  return metadata;
}

export function runtimeCommitMismatch(
  dashboardCommit: string,
  botRuntimeHeartbeat: { metadata: Record<string, unknown> | null } | null,
): boolean {
  const botCommit = botRuntimeHeartbeat?.metadata?.commit;
  if (typeof botCommit !== "string") return false;
  if (!dashboardCommit || dashboardCommit === "unknown") return false;
  if (!botCommit || botCommit === "unknown") return false;
  return dashboardCommit !== botCommit;
}
