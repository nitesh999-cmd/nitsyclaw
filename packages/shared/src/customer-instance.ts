import {
  evaluateTenantBoundaries,
  type TenantBoundaryReadiness,
  type TenantContext,
} from "./tenancy.js";

export type CustomerInstanceMode = "private-owner" | "customer";
export type CustomerInstanceStage = "personal" | "pilot" | "public-sale";

export interface CustomerInstanceInput {
  instanceId?: string;
  ownerHash?: string;
  displayName?: string;
  mode?: CustomerInstanceMode;
  stage?: CustomerInstanceStage;
  allowedSurfaces?: Array<"whatsapp" | "dashboard">;
}

export interface CustomerInstance {
  instanceId: string;
  ownerHash: string;
  displayName: string;
  mode: CustomerInstanceMode;
  stage: CustomerInstanceStage;
  allowedSurfaces: Array<"whatsapp" | "dashboard">;
  tenant: TenantContext;
}

export interface CustomerInstanceReadiness {
  instance: CustomerInstance;
  tenantReadiness: TenantBoundaryReadiness;
  canUseForPersonal: boolean;
  canPilotWithHumanSetup: boolean;
  canSellPublicly: boolean;
  blockers: string[];
  nextActions: string[];
}

const DEFAULT_OWNER_HASH = "owner";

export function createCustomerInstance(input: CustomerInstanceInput = {}): CustomerInstance {
  const ownerHash = cleanToken(input.ownerHash) ?? DEFAULT_OWNER_HASH;
  const mode = input.mode ?? (input.stage === "public-sale" ? "customer" : "private-owner");
  const stage = input.stage ?? (mode === "customer" ? "pilot" : "personal");
  const instanceId = cleanToken(input.instanceId) ?? `${mode}:${ownerHash}`;
  const displayName = cleanLabel(input.displayName) ?? (mode === "customer" ? "Customer" : "Nitesh");
  const allowedSurfaces = normalizeSurfaces(input.allowedSurfaces);

  return {
    instanceId,
    ownerHash,
    displayName,
    mode,
    stage,
    allowedSurfaces,
    tenant: {
      tenantId: instanceId,
      ownerHash,
      mode,
    },
  };
}

export function evaluateCustomerInstanceReadiness(
  input: CustomerInstanceInput = {},
  env: Parameters<typeof evaluateTenantBoundaries>[0] = process.env as Parameters<typeof evaluateTenantBoundaries>[0],
): CustomerInstanceReadiness {
  const instance = createCustomerInstance(input);
  const tenantReadiness = evaluateTenantBoundaries(env);
  const customerMode = instance.mode === "customer" || instance.stage !== "personal";
  const blockers = [
    ...tenantReadiness.blockers,
    ...(customerMode && !instance.allowedSurfaces.includes("dashboard")
      ? ["customer instances need a dashboard control surface"]
      : []),
    ...(instance.stage === "public-sale" && tenantReadiness.mode !== "public-sale"
      ? ["public sale mode is not enabled"]
      : []),
  ];

  return {
    instance,
    tenantReadiness,
    canUseForPersonal: instance.mode === "private-owner" && instance.stage === "personal",
    canPilotWithHumanSetup: customerMode && !tenantReadiness.safeForPublicSale,
    canSellPublicly: instance.stage === "public-sale" && tenantReadiness.safeForPublicSale && blockers.length === 0,
    blockers,
    nextActions: customerMode
      ? [
          "Keep new customer instances in pilot mode until tenant storage is verified.",
          "Create one owner/customer identity per instance before connecting providers.",
          ...tenantReadiness.nextActions,
        ]
      : tenantReadiness.nextActions,
  };
}

export function assertCustomerInstanceCanSell(readiness: CustomerInstanceReadiness): void {
  if (!readiness.canSellPublicly) {
    throw new Error(`Customer instance is not safe to sell: ${readiness.blockers.join("; ")}`);
  }
}

function cleanToken(value: string | undefined): string | null {
  const cleaned = value?.trim();
  if (!cleaned) return null;
  if (!/^[a-zA-Z0-9:_-]{3,96}$/.test(cleaned)) {
    throw new Error("customer instance identifiers may only contain letters, numbers, colon, dash, and underscore");
  }
  return cleaned;
}

function cleanLabel(value: string | undefined): string | null {
  const cleaned = value?.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;
  if (cleaned.length > 80) throw new Error("customer instance display name is too long");
  return cleaned;
}

function normalizeSurfaces(
  surfaces: Array<"whatsapp" | "dashboard"> | undefined,
): Array<"whatsapp" | "dashboard"> {
  const defaults: Array<"whatsapp" | "dashboard"> = ["whatsapp", "dashboard"];
  const unique = Array.from(new Set<"whatsapp" | "dashboard">(surfaces ?? defaults));
  return unique.length ? unique : ["whatsapp", "dashboard"];
}
