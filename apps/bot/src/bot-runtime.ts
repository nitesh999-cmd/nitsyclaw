export interface BotRuntimeMetadata extends Record<string, unknown> {
  platform: "railway" | "unknown";
  commit: string;
  commitShort: string;
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
): BotRuntimeMetadata {
  const commit = clean(env.RAILWAY_GIT_COMMIT_SHA) ?? "unknown";
  const metadata: BotRuntimeMetadata = {
    platform: env.RAILWAY_ENVIRONMENT_ID || env.RAILWAY_DEPLOYMENT_ID ? "railway" : "unknown",
    commit,
    commitShort: commit === "unknown" ? "unknown" : commit.slice(0, 7),
    startedAt: now.toISOString(),
    nodeVersion: process.version,
  };

  const deploymentId = clean(env.RAILWAY_DEPLOYMENT_ID);
  const environmentId = clean(env.RAILWAY_ENVIRONMENT_ID);
  const serviceId = clean(env.RAILWAY_SERVICE_ID);

  if (deploymentId) metadata.deploymentId = deploymentId;
  if (environmentId) metadata.environmentId = environmentId;
  if (serviceId) metadata.serviceId = serviceId;

  return metadata;
}
