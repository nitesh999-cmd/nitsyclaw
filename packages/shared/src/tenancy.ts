import { hashPhone } from "./utils/crypto.js";

export type TenantBoundaryKind =
  | "tenant_scoped"
  | "owner_scoped"
  | "single_owner_only"
  | "global_operational";

export interface TenantTableBoundary {
  table: string;
  kind: TenantBoundaryKind;
  scopeColumn: string | null;
  publicSaleRisk: "blocked" | "review" | "ok";
  note: string;
}

export interface TenantContext {
  tenantId: string;
  ownerHash: string;
  mode: "private-owner" | "customer";
}

export interface TenantBoundaryReadiness {
  mode: "private-owner" | "public-sale";
  codeReadyForPublicSale: boolean;
  safeForPublicSale: boolean;
  blockers: string[];
  verified: string[];
  tableBoundaries: TenantTableBoundary[];
  nextActions: string[];
}

interface TenantBoundaryEnv {
  NITSYCLAW_PUBLIC_SALE_MODE?: string;
  NITSYCLAW_AUTH_MODEL?: string;
  NITSYCLAW_TENANT_ISOLATION?: string;
}

export const TENANT_TABLE_BOUNDARIES: TenantTableBoundary[] = [
  {
    table: "messages",
    kind: "owner_scoped",
    scopeColumn: "from_number",
    publicSaleRisk: "review",
    note: "Currently stores hashed owner/contact identity, not a first-class tenant_id.",
  },
  {
    table: "memories",
    kind: "single_owner_only",
    scopeColumn: null,
    publicSaleRisk: "blocked",
    note: "Personal memory has no tenant column; cross-customer memory leakage would be possible in public sale mode.",
  },
  {
    table: "reminders",
    kind: "single_owner_only",
    scopeColumn: null,
    publicSaleRisk: "blocked",
    note: "Reminder rows are not tenant-scoped yet.",
  },
  {
    table: "expenses",
    kind: "single_owner_only",
    scopeColumn: null,
    publicSaleRisk: "blocked",
    note: "Expense rows are not tenant-scoped yet.",
  },
  {
    table: "briefs",
    kind: "single_owner_only",
    scopeColumn: null,
    publicSaleRisk: "blocked",
    note: "Daily briefs are unique by date only; public sale needs tenant_id + date uniqueness.",
  },
  {
    table: "confirmations",
    kind: "single_owner_only",
    scopeColumn: null,
    publicSaleRisk: "blocked",
    note: "Risky action approvals are not tied to a tenant yet.",
  },
  {
    table: "feature_requests",
    kind: "owner_scoped",
    scopeColumn: "requested_by",
    publicSaleRisk: "review",
    note: "Requested-by is an actor hint, not a strict tenant boundary.",
  },
  {
    table: "audit_log",
    kind: "global_operational",
    scopeColumn: null,
    publicSaleRisk: "review",
    note: "Operational logs are global; public sale needs tenant-aware filtering and export/delete rules.",
  },
  {
    table: "profile_context",
    kind: "tenant_scoped",
    scopeColumn: "owner_hash",
    publicSaleRisk: "ok",
    note: "Already has owner_hash and unique owner/key boundary.",
  },
  {
    table: "connected_accounts",
    kind: "tenant_scoped",
    scopeColumn: "owner_hash",
    publicSaleRisk: "ok",
    note: "Already scopes connected provider accounts by owner_hash.",
  },
  {
    table: "command_jobs",
    kind: "tenant_scoped",
    scopeColumn: "owner_hash",
    publicSaleRisk: "ok",
    note: "Already records owner_hash for command status and recovery.",
  },
  {
    table: "system_heartbeats",
    kind: "global_operational",
    scopeColumn: null,
    publicSaleRisk: "ok",
    note: "Global runtime state is acceptable when it contains no customer payloads.",
  },
  {
    table: "dashboard_auth_attempts",
    kind: "global_operational",
    scopeColumn: "client_key",
    publicSaleRisk: "review",
    note: "Public sale needs account-aware lockout keys, not only client/network keys.",
  },
];

export function privateOwnerTenant(ownerHash = "owner"): TenantContext {
  return {
    tenantId: ownerHash,
    ownerHash,
    mode: "private-owner",
  };
}

export function privateOwnerTenantForPhone(phone: string): TenantContext {
  return privateOwnerTenant(hashPhone(phone));
}

export function requireTenantContext(context: TenantContext | null | undefined): TenantContext {
  if (!context?.tenantId?.trim() || !context.ownerHash?.trim()) {
    throw new Error("tenant context is required for customer data access");
  }
  return context;
}

export function tenantBoundaryFor(table: string): TenantTableBoundary | null {
  return TENANT_TABLE_BOUNDARIES.find((boundary) => boundary.table === table) ?? null;
}

export function tableRequiresTenantMigration(table: string): boolean {
  return tenantBoundaryFor(table)?.publicSaleRisk === "blocked";
}

export function tableIsTenantScoped(table: string): boolean {
  return tenantBoundaryFor(table)?.kind === "tenant_scoped";
}

export function evaluateTenantBoundaries(
  env: TenantBoundaryEnv = process.env as TenantBoundaryEnv,
): TenantBoundaryReadiness {
  const mode = env.NITSYCLAW_PUBLIC_SALE_MODE === "1" ? "public-sale" : "private-owner";
  const blockedTables = TENANT_TABLE_BOUNDARIES.filter((table) => table.publicSaleRisk === "blocked");
  const reviewTables = TENANT_TABLE_BOUNDARIES.filter((table) => table.publicSaleRisk === "review");
  const authReady = env.NITSYCLAW_AUTH_MODEL === "multi-user";
  const isolationFlagReady = env.NITSYCLAW_TENANT_ISOLATION === "verified";
  const codeReadyForPublicSale = blockedTables.length === 0;

  const blockers = [
    ...(authReady ? [] : ["multi-user auth is not verified"]),
    ...(isolationFlagReady ? [] : ["tenant isolation is not verified"]),
    ...(codeReadyForPublicSale ? [] : [`tenant-scoped storage is missing for ${blockedTables.map((table) => table.table).join(", ")}`]),
    ...(reviewTables.length === 0 ? [] : [`tenant review is still needed for ${reviewTables.map((table) => table.table).join(", ")}`]),
  ];

  return {
    mode,
    codeReadyForPublicSale,
    safeForPublicSale: mode === "public-sale" && authReady && isolationFlagReady && blockers.length === 0,
    blockers,
    verified: [
      ...(authReady ? ["multi-user auth flag"] : []),
      ...(isolationFlagReady ? ["tenant isolation flag"] : []),
      ...TENANT_TABLE_BOUNDARIES
        .filter((table) => table.publicSaleRisk === "ok")
        .map((table) => `${table.table} scoped`),
    ],
    tableBoundaries: TENANT_TABLE_BOUNDARIES,
    nextActions: [
      "Add tenant_id/owner_hash to memories, reminders, expenses, briefs, and confirmations.",
      "Make all reads/writes require an explicit tenant context before public sale mode can be enabled.",
      "Change daily brief uniqueness from date-only to tenant plus date.",
      "Add account-aware dashboard sessions before onboarding any customer.",
      "Add tenant-scoped export/delete tests for every stored customer data table.",
    ],
  };
}

export function assertPublicSaleTenantBoundaries(
  env: TenantBoundaryEnv = process.env as TenantBoundaryEnv,
): TenantBoundaryReadiness {
  const readiness = evaluateTenantBoundaries(env);
  if (readiness.mode === "public-sale" && !readiness.safeForPublicSale) {
    throw new Error(`Public sale mode is blocked: ${readiness.blockers.join("; ")}`);
  }
  return readiness;
}
