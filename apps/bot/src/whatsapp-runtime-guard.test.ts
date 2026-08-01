import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  assertWhatsAppRuntimeAllowed,
  whatsappRuntimeOwner,
  WHATSAPP_RUNTIME_OWNERS,
  WHATSAPP_RUNTIME_OWNER_ENV,
} from "./whatsapp-runtime-guard";

/**
 * The previous suite asserted "allows Railway runtime without local override".
 * That assertion is deliberately inverted here, not weakened: unconditional
 * Railway authorization is the defect being fixed. Railway keeps its capability
 * but must now claim it explicitly, and the closed path below is far stricter
 * than what it replaces.
 */

const RAILWAY = {
  RAILWAY_DEPLOYMENT_ID: "deployment_123",
  RAILWAY_ENVIRONMENT_ID: "environment_123",
};

describe("WhatsApp runtime ownership on Railway", () => {
  test("a Railway container with no ownership setting cannot start WhatsApp", () => {
    expect(() => assertWhatsAppRuntimeAllowed({ ...RAILWAY })).toThrow(
      /must be exactly "railway" but it is not set/,
    );
  });

  test('a Railway container set to "local" cannot start WhatsApp', () => {
    expect(() =>
      assertWhatsAppRuntimeAllowed({ ...RAILWAY, [WHATSAPP_RUNTIME_OWNER_ENV]: "local" }),
    ).toThrow(/must be exactly "railway"/);
  });

  test('a Railway container set to "laptop" cannot start WhatsApp', () => {
    expect(() =>
      assertWhatsAppRuntimeAllowed({ ...RAILWAY, [WHATSAPP_RUNTIME_OWNER_ENV]: "laptop" }),
    ).toThrow(/must be exactly "railway"/);
  });

  test("malformed and unknown ownership values all fail closed on Railway", () => {
    const rejected = [
      "",
      "   ",
      "Railway",
      "RAILWAY",
      "railway-prod",
      "railway2",
      "rail",
      "true",
      "1",
      "yes",
      "laptop,railway",
      "  railway  x",
      "undefined",
      "null",
    ];
    for (const value of rejected) {
      expect(
        () => assertWhatsAppRuntimeAllowed({ ...RAILWAY, [WHATSAPP_RUNTIME_OWNER_ENV]: value }),
        `value ${JSON.stringify(value)} must be refused`,
      ).toThrow(/Refusing to start WhatsApp on Railway/);
    }
  });

  test('only the exact string "railway" retains the authorized Railway path', () => {
    expect(() =>
      assertWhatsAppRuntimeAllowed({ ...RAILWAY, [WHATSAPP_RUNTIME_OWNER_ENV]: "railway" }),
    ).not.toThrow();
    // Surrounding whitespace is tolerated because env plumbing adds it; the
    // value itself is still matched exactly.
    expect(() =>
      assertWhatsAppRuntimeAllowed({ ...RAILWAY, [WHATSAPP_RUNTIME_OWNER_ENV]: "  railway  " }),
    ).not.toThrow();
  });

  test("either Railway id alone is enough to trigger the closed path", () => {
    expect(() => assertWhatsAppRuntimeAllowed({ RAILWAY_ENVIRONMENT_ID: "environment_123" })).toThrow(
      /Refusing to start WhatsApp on Railway/,
    );
    expect(() => assertWhatsAppRuntimeAllowed({ RAILWAY_DEPLOYMENT_ID: "deployment_123" })).toThrow(
      /Refusing to start WhatsApp on Railway/,
    );
  });

  test("a Railway container cannot be authorized by the local override alone", () => {
    // The local flag must not become a back door into the Railway path.
    expect(() =>
      assertWhatsAppRuntimeAllowed({ ...RAILWAY, NITSYCLAW_ALLOW_LOCAL_WHATSAPP: "1" }),
    ).toThrow(/Refusing to start WhatsApp on Railway/);
  });
});

describe("laptop runtime contract is unchanged", () => {
  test("the proven launcher contract still authorizes this machine", () => {
    expect(() =>
      assertWhatsAppRuntimeAllowed({
        NITSYCLAW_ALLOW_LOCAL_WHATSAPP: "1",
        NITSYCLAW_RUNTIME_OWNER: "local-dev",
      }),
    ).not.toThrow();
  });

  test("no new setting is required locally", () => {
    // Exactly what the existing secret file provides: the ownership variable is
    // absent and the laptop still starts.
    const env = { NITSYCLAW_ALLOW_LOCAL_WHATSAPP: "1" };
    expect(WHATSAPP_RUNTIME_OWNER_ENV in env).toBe(false);
    expect(() => assertWhatsAppRuntimeAllowed(env)).not.toThrow();
  });

  test('an explicit "laptop" owner is also accepted with the local flag', () => {
    expect(() =>
      assertWhatsAppRuntimeAllowed({
        NITSYCLAW_ALLOW_LOCAL_WHATSAPP: "1",
        [WHATSAPP_RUNTIME_OWNER_ENV]: "laptop",
      }),
    ).not.toThrow();
  });

  test("local WhatsApp is still blocked without the explicit local flag", () => {
    expect(() => assertWhatsAppRuntimeAllowed({})).toThrow(/NITSYCLAW_ALLOW_LOCAL_WHATSAPP=1/);
  });

  test("the local safety check is not weakened by the new setting", () => {
    // Declaring laptop ownership must not substitute for the local flag.
    expect(() => assertWhatsAppRuntimeAllowed({ [WHATSAPP_RUNTIME_OWNER_ENV]: "laptop" })).toThrow(
      /NITSYCLAW_ALLOW_LOCAL_WHATSAPP=1/,
    );
  });

  test("this machine stands down when ownership is assigned to Railway", () => {
    // Symmetric protection: prevents the laptop becoming the second client
    // after a deliberate migration, even with the local flag still set.
    expect(() =>
      assertWhatsAppRuntimeAllowed({
        NITSYCLAW_ALLOW_LOCAL_WHATSAPP: "1",
        [WHATSAPP_RUNTIME_OWNER_ENV]: "railway",
      }),
    ).toThrow(/assigns the session to Railway/);
  });
});

describe("ownership vocabulary", () => {
  test("is a closed two-member list", () => {
    expect([...WHATSAPP_RUNTIME_OWNERS]).toEqual(["laptop", "railway"]);
  });

  test("resolves only exact members", () => {
    expect(whatsappRuntimeOwner({ [WHATSAPP_RUNTIME_OWNER_ENV]: "railway" })).toBe("railway");
    expect(whatsappRuntimeOwner({ [WHATSAPP_RUNTIME_OWNER_ENV]: "laptop" })).toBe("laptop");
    for (const value of ["Railway", "railway-prod", "", "   ", "local", "1"]) {
      expect(whatsappRuntimeOwner({ [WHATSAPP_RUNTIME_OWNER_ENV]: value }), value).toBeUndefined();
    }
    expect(whatsappRuntimeOwner({})).toBeUndefined();
  });
});

describe("rejection happens before anything WhatsApp-related is constructed", () => {
  const source = readFileSync("apps/bot/src/index.ts", "utf8");
  const at = (needle: string) => {
    const i = source.indexOf(needle);
    expect(i, `expected to find ${needle} in index.ts`).toBeGreaterThan(-1);
    return i;
  };

  test("the guard runs before QR recovery, the client, Chromium and the session", () => {
    const guard = at("assertWhatsAppRuntimeAllowed(process.env)");

    // QR recovery controller and its HTTP server.
    expect(guard).toBeLessThan(at("new QrRecoveryController("));
    expect(guard).toBeLessThan(at("startQrRecoveryServer("));
    // whatsapp-web.js client construction, which launches Chromium and opens
    // the session directory.
    expect(guard).toBeLessThan(at("new WwebjsClient("));
    expect(guard).toBeLessThan(at("whatsappSessionDir("));
    // Scheduler and message handling.
    expect(guard).toBeLessThan(at("startScheduler("));
    expect(guard).toBeLessThan(at("onMessage("));
  });

  test("nothing that touches the database precedes the guard", () => {
    const guard = at("assertWhatsAppRuntimeAllowed(process.env)");
    expect(guard).toBeLessThan(at("getDb("));
    expect(guard).toBeLessThan(at("upsertSystemHeartbeat("));
  });

  test("it throws rather than returning a value callers could ignore", () => {
    const guardSource = readFileSync("apps/bot/src/whatsapp-runtime-guard.ts", "utf8");
    expect(guardSource).toContain("throw new Error(");
    expect(source).toContain("assertWhatsAppRuntimeAllowed(process.env);");
  });
});
