export interface SaleReadinessResult {
  ready: boolean;
  mode: "private-owner" | "public-sale";
  blockers: string[];
  verified: string[];
}

interface SaleReadinessEnv {
  NITSYCLAW_PUBLIC_SALE_MODE?: string;
  NITSYCLAW_AUTH_MODEL?: string;
  NITSYCLAW_TENANT_ISOLATION?: string;
  NITSYCLAW_PROVIDER_DELETE?: string;
  NITSYCLAW_LEGAL_COPY?: string;
}

export function evaluateSaleReadiness(
  env: SaleReadinessEnv = process.env as unknown as SaleReadinessEnv,
): SaleReadinessResult {
  const mode = env.NITSYCLAW_PUBLIC_SALE_MODE === "1" ? "public-sale" : "private-owner";
  const checks = [
    {
      label: "multi-user auth",
      ok: env.NITSYCLAW_AUTH_MODEL === "multi-user",
      blocker: "multi-user auth is not verified",
    },
    {
      label: "tenant isolation",
      ok: env.NITSYCLAW_TENANT_ISOLATION === "verified",
      blocker: "tenant isolation is not verified",
    },
    {
      label: "provider-side delete/revoke",
      ok: env.NITSYCLAW_PROVIDER_DELETE === "verified",
      blocker: "provider-side delete/revoke is not verified",
    },
    {
      label: "legal/privacy copy",
      ok: env.NITSYCLAW_LEGAL_COPY === "verified",
      blocker: "legal/privacy copy is not verified",
    },
  ];

  const codeBlockers = [
    "code-level tenant isolation is not implemented",
    "session-bound user identity is not implemented",
  ];
  const verified = checks.filter((check) => check.ok).map((check) => check.label);
  const blockers = [
    ...checks.filter((check) => !check.ok).map((check) => check.blocker),
    ...codeBlockers,
  ];

  return {
    ready: mode === "public-sale" && blockers.length === 0,
    mode,
    blockers,
    verified,
  };
}
