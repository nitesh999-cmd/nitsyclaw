export interface WhatsAppRuntimeGuardEnv {
  [key: string]: string | undefined;
  RAILWAY_DEPLOYMENT_ID?: string;
  RAILWAY_ENVIRONMENT_ID?: string;
  NITSYCLAW_ALLOW_LOCAL_WHATSAPP?: string;
  NITSYCLAW_RUNTIME_OWNER?: string;
}

function isEnabled(value: string | undefined): boolean {
  return value?.trim() === "1";
}

function isRailwayRuntime(env: WhatsAppRuntimeGuardEnv): boolean {
  return Boolean(env.RAILWAY_ENVIRONMENT_ID?.trim() || env.RAILWAY_DEPLOYMENT_ID?.trim());
}

export function assertWhatsAppRuntimeAllowed(env: WhatsAppRuntimeGuardEnv): void {
  if (isRailwayRuntime(env)) return;
  if (isEnabled(env.NITSYCLAW_ALLOW_LOCAL_WHATSAPP)) return;

  const owner = env.NITSYCLAW_RUNTIME_OWNER?.trim();
  const ownerLabel = owner ? ` owner=${owner}` : "";
  throw new Error(
    `Refusing to start local WhatsApp bot${ownerLabel}. Set NITSYCLAW_ALLOW_LOCAL_WHATSAPP=1 only when you intentionally want this machine to reply to WhatsApp.`,
  );
}
