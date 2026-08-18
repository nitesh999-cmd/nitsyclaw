/**
 * Which machine is allowed to own the WhatsApp session.
 *
 * whatsapp-web.js authenticates as the owner's own account. Two live clients on
 * one session invalidate each other, force a re-pair, or double-deliver. Only
 * one runtime may hold it at a time, and which one is a deliberate decision --
 * never an accident of where the process happened to boot.
 *
 * The laptop launcher is the proven production runtime. Railway is retained as
 * a rollback target but is now explicit opt-in: a Railway container refuses to
 * touch WhatsApp unless it has been handed ownership in so many words.
 */
export const WHATSAPP_RUNTIME_OWNERS = ["laptop", "railway"] as const;
export type WhatsAppRuntimeOwner = (typeof WHATSAPP_RUNTIME_OWNERS)[number];

/** The one explicit, non-secret setting that assigns ownership. */
export const WHATSAPP_RUNTIME_OWNER_ENV = "NITSYCLAW_WHATSAPP_RUNTIME_OWNER";

export interface WhatsAppRuntimeGuardEnv {
  [key: string]: string | undefined;
  RAILWAY_DEPLOYMENT_ID?: string;
  RAILWAY_ENVIRONMENT_ID?: string;
  NITSYCLAW_ALLOW_LOCAL_WHATSAPP?: string;
  NITSYCLAW_RUNTIME_OWNER?: string;
  NITSYCLAW_WHATSAPP_RUNTIME_OWNER?: string;
}

function isEnabled(value: string | undefined): boolean {
  return value?.trim() === "1";
}

function isRailwayRuntime(env: WhatsAppRuntimeGuardEnv): boolean {
  return Boolean(env.RAILWAY_ENVIRONMENT_ID?.trim() || env.RAILWAY_DEPLOYMENT_ID?.trim());
}

/**
 * The declared owner, or `undefined` when unset, empty, or not an exact member.
 *
 * Matching is exact after trimming -- no case folding, no prefix match. A shape
 * check would accept `Railway`, `railway-prod` or `railway-2` as authorization
 * for taking over a live WhatsApp session; only a value someone deliberately
 * typed from the closed list counts.
 */
export function whatsappRuntimeOwner(
  env: WhatsAppRuntimeGuardEnv,
): WhatsAppRuntimeOwner | undefined {
  const declared = env[WHATSAPP_RUNTIME_OWNER_ENV]?.trim();
  return (WHATSAPP_RUNTIME_OWNERS as readonly string[]).includes(declared ?? "")
    ? (declared as WhatsAppRuntimeOwner)
    : undefined;
}

/**
 * Throws unless this process is the machine authorized to own the session.
 *
 * Called from `index.ts` before the QR recovery controller and server, before
 * `new WwebjsClient(...)` -- and therefore before Chromium launch and session
 * directory access -- and before the scheduler or any message handling. A throw
 * here means nothing WhatsApp-related is ever constructed.
 *
 * Railway: fails closed. Missing, empty, `local`, `laptop`, misspelled or
 * unknown values all refuse. Only the exact string `railway` proceeds.
 *
 * Laptop: unchanged from the proven contract -- `NITSYCLAW_ALLOW_LOCAL_WHATSAPP=1`
 * still authorizes, and no new setting is required, so the existing launcher,
 * Broom and secret file keep working untouched. The one addition is symmetric
 * protection: if ownership has been explicitly handed to Railway, this machine
 * stands down rather than becoming the second client.
 */
export type WhatsAppRuntimeMode =
  | { mode: "client" }
  | { mode: "no-client"; reason: "runtime_not_owner" };

/**
 * Decides what this process may do, or throws when it must not run at all.
 *
 * `no-client` exists because a Railway container that is *not* the owner still
 * has to answer its healthcheck. Throwing before the health server starts means
 * the deployment never becomes healthy, Railway retries and then keeps the
 * PREVIOUS build running -- which is the older, permissive one that has no
 * ownership check at all. Failing closed on WhatsApp while still serving health
 * is what actually retires that build.
 *
 * Ownership is laptop-owned by decision: the laptop holds the session, and a
 * Railway container marked `laptop` serves health without ever constructing a
 * client. Only an explicit `railway` hands the session over.
 */
export function resolveWhatsAppRuntimeMode(env: WhatsAppRuntimeGuardEnv): WhatsAppRuntimeMode {
  const owner = whatsappRuntimeOwner(env);

  if (isRailwayRuntime(env)) {
    if (owner === "railway") return { mode: "client" };
    // Explicitly not the owner: healthy, but never a WhatsApp client.
    if (owner === "laptop") return { mode: "no-client", reason: "runtime_not_owner" };
    // Unset or unrecognised still fails closed: an unconfigured container must
    // not silently become a half-running service nobody assigned.
    const declared = env[WHATSAPP_RUNTIME_OWNER_ENV]?.trim();
    const seen = declared ? `got "${declared}"` : "it is not set";
    throw new Error(
      `Refusing to start WhatsApp on Railway: ${WHATSAPP_RUNTIME_OWNER_ENV} must be exactly "railway" or "laptop" but ${seen}. ` +
        "The laptop launcher is the current WhatsApp runtime; starting here would put a second client on the same session.",
    );
  }

  if (owner === "railway") {
    throw new Error(
      `Refusing to start local WhatsApp bot: ${WHATSAPP_RUNTIME_OWNER_ENV}="railway" assigns the session to Railway. ` +
        `Unset it, or set it to "laptop", before running this machine as the WhatsApp runtime.`,
    );
  }

  if (isEnabled(env.NITSYCLAW_ALLOW_LOCAL_WHATSAPP)) return { mode: "client" };

  const runtimeOwner = env.NITSYCLAW_RUNTIME_OWNER?.trim();
  const ownerLabel = runtimeOwner ? ` owner=${runtimeOwner}` : "";
  throw new Error(
    `Refusing to start local WhatsApp bot${ownerLabel}. Set NITSYCLAW_ALLOW_LOCAL_WHATSAPP=1 only when you intentionally want this machine to reply to WhatsApp.`,
  );
}

/** Back-compatible wrapper: throws when refused, and returns the decided mode. */
export function assertWhatsAppRuntimeAllowed(env: WhatsAppRuntimeGuardEnv): WhatsAppRuntimeMode {
  return resolveWhatsAppRuntimeMode(env);
}
