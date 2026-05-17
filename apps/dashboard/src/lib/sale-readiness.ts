import { evaluateTenantBoundaries } from "@nitsyclaw/shared/tenancy";

export interface SaleReadinessResult {
  ready: boolean;
  mode: "private-owner" | "public-sale";
  privateUseScore: number;
  publicSaleScore: number;
  privateUseBlockers: string[];
  blockers: string[];
  verified: string[];
  nextActions: string[];
  tenantBoundaryBlockers: string[];
}

interface SaleReadinessEnv {
  NITSYCLAW_PUBLIC_SALE_MODE?: string;
  NITSYCLAW_AUTH_MODEL?: string;
  NITSYCLAW_TENANT_ISOLATION?: string;
  NITSYCLAW_PROVIDER_DELETE?: string;
  NITSYCLAW_LEGAL_COPY?: string;
  NITSYCLAW_DASHBOARD_PASSWORD?: string;
  DATABASE_URL?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ENCRYPTION_KEY?: string;
  WHATSAPP_OWNER_NUMBER?: string;
}

export function evaluateSaleReadiness(
  env: SaleReadinessEnv = process.env as unknown as SaleReadinessEnv,
): SaleReadinessResult {
  const mode = env.NITSYCLAW_PUBLIC_SALE_MODE === "1" ? "public-sale" : "private-owner";
  const tenantBoundaries = evaluateTenantBoundaries(env);

  const privateUseChecks = [
    {
      label: "owner dashboard password",
      ok: hasStrongPassword(env.NITSYCLAW_DASHBOARD_PASSWORD),
      blocker: "owner dashboard password is missing or too weak",
      action: "Set a strong NITSYCLAW_DASHBOARD_PASSWORD in production.",
    },
    {
      label: "database",
      ok: hasPostgresUrl(env.DATABASE_URL),
      blocker: "database URL is missing or invalid",
      action: "Set a valid Postgres DATABASE_URL and verify migrations.",
    },
    {
      label: "AI provider",
      ok: hasValue(env.ANTHROPIC_API_KEY) || hasValue(env.OPENAI_API_KEY),
      blocker: "AI provider key is not configured",
      action: "Set ANTHROPIC_API_KEY or OPENAI_API_KEY.",
    },
    {
      label: "storage encryption",
      ok: hasValidEncryptionKey(env.ENCRYPTION_KEY),
      blocker: "storage encryption key is missing or invalid",
      action: "Set a 32-byte base64 ENCRYPTION_KEY and keep plaintext storage disabled.",
    },
    {
      label: "owner WhatsApp identity",
      ok: hasPhoneNumber(env.WHATSAPP_OWNER_NUMBER),
      blocker: "owner WhatsApp number is missing or invalid",
      action: "Set WHATSAPP_OWNER_NUMBER in international format so replies and audit trails are owner-bound.",
    },
  ];

  const publicSaleChecks = [
    {
      label: "multi-user auth",
      ok: env.NITSYCLAW_AUTH_MODEL === "multi-user",
      blocker: "multi-user auth is not verified",
      action: "Implement account signup/login with session-bound user identity.",
    },
    {
      label: "tenant isolation",
      ok: env.NITSYCLAW_TENANT_ISOLATION === "verified",
      blocker: "tenant isolation is not verified",
      action: "Add tenant IDs to stored data and enforce tenant-scoped reads/writes.",
    },
    {
      label: "provider-side delete/revoke",
      ok: env.NITSYCLAW_PROVIDER_DELETE === "verified",
      blocker: "provider-side delete/revoke is not verified",
      action: "Verify every provider can disconnect and revoke customer data safely.",
    },
    {
      label: "legal/privacy copy",
      ok: env.NITSYCLAW_LEGAL_COPY === "verified",
      blocker: "legal/privacy copy is not verified",
      action: "Publish reviewed privacy, terms, support, and data-handling copy.",
    },
  ];

  const privateUseBlockers = privateUseChecks.filter((check) => !check.ok).map((check) => check.blocker);
  const blockers = [
    ...publicSaleChecks.filter((check) => !check.ok).map((check) => check.blocker),
    ...tenantBoundaries.blockers.filter((blocker) => !publicSaleChecks.some((check) => check.blocker === blocker)),
  ];
  const verified = [
    ...privateUseChecks.filter((check) => check.ok).map((check) => check.label),
    ...publicSaleChecks.filter((check) => check.ok).map((check) => check.label),
    ...tenantBoundaries.verified,
  ];
  const nextActions = [
    ...privateUseChecks.filter((check) => !check.ok).map((check) => check.action),
    ...publicSaleChecks.filter((check) => !check.ok).map((check) => check.action),
    ...tenantBoundaries.nextActions,
  ];

  return {
    ready: mode === "public-sale" && blockers.length === 0 && tenantBoundaries.safeForPublicSale,
    mode,
    privateUseScore: score(privateUseChecks),
    publicSaleScore: Math.min(score(publicSaleChecks), 5),
    privateUseBlockers,
    blockers,
    verified,
    nextActions,
    tenantBoundaryBlockers: tenantBoundaries.blockers,
  };
}

function hasValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function hasStrongPassword(value: string | undefined): boolean {
  const password = value?.trim();
  return Boolean(password && password.length >= 12);
}

function hasPostgresUrl(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "postgres:" || url.protocol === "postgresql:";
  } catch {
    return false;
  }
}

function hasValidEncryptionKey(value: string | undefined): boolean {
  const key = value?.trim();
  if (!key) return false;
  try {
    return globalThis.atob(key).length === 32;
  } catch {
    return false;
  }
}

function hasPhoneNumber(value: string | undefined): boolean {
  return /^\+\d{8,15}$/.test(value?.trim() ?? "");
}

function score(checks: Array<{ ok: boolean }>): number {
  if (checks.length === 0) return 0;
  return Math.round((checks.filter((check) => check.ok).length / checks.length) * 10);
}
