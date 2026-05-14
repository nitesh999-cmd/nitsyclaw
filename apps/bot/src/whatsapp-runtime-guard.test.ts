import { describe, expect, test } from "vitest";
import { assertWhatsAppRuntimeAllowed } from "./whatsapp-runtime-guard";

describe("WhatsApp runtime guard", () => {
  test("allows Railway runtime without local override", () => {
    expect(() => assertWhatsAppRuntimeAllowed({
      RAILWAY_DEPLOYMENT_ID: "deployment_123",
      RAILWAY_ENVIRONMENT_ID: "environment_123",
    })).not.toThrow();
  });

  test("blocks local WhatsApp bot unless explicitly allowed", () => {
    expect(() => assertWhatsAppRuntimeAllowed({})).toThrow(/NITSYCLAW_ALLOW_LOCAL_WHATSAPP=1/);
  });

  test("allows explicitly approved local WhatsApp bot", () => {
    expect(() => assertWhatsAppRuntimeAllowed({
      NITSYCLAW_ALLOW_LOCAL_WHATSAPP: "1",
      NITSYCLAW_RUNTIME_OWNER: "local-dev",
    })).not.toThrow();
  });
});
