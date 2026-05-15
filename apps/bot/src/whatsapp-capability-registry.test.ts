import { describe, expect, it } from "vitest";
import {
  WHATSAPP_CAPABILITY_REGISTRY,
  formatCapabilityExamples,
  getCapabilitiesByStatus,
} from "./whatsapp-capability-registry.js";
import {
  formatReadyCapabilitiesOneLine,
  formatWhatsAppCapabilityMatrix,
  formatWhatsAppHelpReply,
} from "./whatsapp-capabilities.js";

describe("WhatsApp capability registry", () => {
  it("keeps all user-facing capabilities in one typed registry", () => {
    const ids = WHATSAPP_CAPABILITY_REGISTRY.map((capability) => capability.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(getCapabilitiesByStatus("ready").map((capability) => capability.id)).toContain("expenses");
    expect(getCapabilitiesByStatus("needs_setup").map((capability) => capability.id)).toContain("google-photos");
    expect(getCapabilitiesByStatus("approval_required").map((capability) => capability.id)).toContain("phone-actions");
  });

  it("renders status/help copy without claiming blocked integrations are live", () => {
    const help = formatWhatsAppHelpReply();
    const matrix = formatWhatsAppCapabilityMatrix();

    expect(formatReadyCapabilitiesOneLine()).toContain("SMS drafts");
    expect(help).toContain("Working now");
    expect(help).toContain("Needs setup");
    expect(help).toContain("self test");
    expect(matrix).toContain("What I can do from WhatsApp");
    expect(matrix).toContain("if something is not ready");
    expect(matrix).toContain("Gmail and Outlook");
    expect(matrix).toContain("No mailbox is accessed until OAuth setup is complete");
    expect(matrix).toContain("Runtime:");
    expect(matrix).toContain("Next:");
    expect(matrix).not.toContain("Gmail is connected");
    expect(matrix).not.toContain("Bank feeds: connected");
  });

  it("offers practical WhatsApp examples from the registry", () => {
    const examples = formatCapabilityExamples(12);

    expect(examples).toContain("Remind me to call Mukesh tomorrow at 10 am");
    expect(examples).toContain("draft sms to John saying I am late");
    expect(examples.length).toBe(12);
  });
});
