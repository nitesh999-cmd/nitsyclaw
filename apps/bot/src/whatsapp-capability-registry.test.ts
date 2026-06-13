import { describe, expect, it } from "vitest";
import {
  WHATSAPP_CAPABILITY_REGISTRY,
  formatCapabilityExamples,
  getCapabilitiesByStatus,
} from "./whatsapp-capability-registry.js";
import {
  formatReadyCapabilitiesOneLine,
  formatWhatsAppCantDoGuard,
  formatWhatsAppCapabilityMatrix,
  formatWhatsAppFullPaConnectionPlan,
  formatWhatsAppHelpReply,
  formatWhatsAppPendingFeatureDevelopmentPlan,
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
    expect(help).toContain("NitsyClaw menu");
    expect(help).toContain("Say what you need");
    expect(help).toContain("Try:");
    expect(help).toContain("Works now:");
    expect(help).toContain("Remind me to call Mukesh tomorrow at 10 am");
    expect(help).toContain("Check before send: I am angry about this bill");
    expect(help).toContain("Needs setup:");
    expect(help).toContain("proof test");
    expect(help).toContain("pending build plan");
    expect(help).toContain("local status");
    expect(help).toContain("Safety:");
    expect(help.split("\n").length).toBeLessThanOrEqual(13);
    expect(help.length).toBeLessThanOrEqual(900);
    expect(help).not.toContain("Runtime:");
    expect(help).not.toContain("Setup snapshot:");
    expect(matrix).toContain("What I can do from WhatsApp");
    expect(matrix).toContain("if something is not ready");
    expect(matrix).toContain("Gmail and Outlook");
    expect(matrix).toContain("No mailbox is accessed until OAuth setup is complete");
    expect(matrix).toContain("Runtime:");
    expect(matrix).toContain("Next:");
    expect(matrix).not.toContain("Gmail is connected");
    expect(matrix).not.toContain("Bank feeds: connected");
  });

  it("renders a truthful pending feature development plan", () => {
    const plan = formatWhatsAppPendingFeatureDevelopmentPlan();

    expect(plan).toContain("Pending build plan");
    expect(plan).toContain("safe local rails");
    expect(plan).toContain("Real external actions need account/provider setup");
    expect(plan).toContain("Works now:");
    expect(plan).toContain("Can build without you:");
    expect(plan).toContain("Connected external accounts: none yet. Local tools are working.");
    expect(plan).toContain("Best next setup:");
    expect(plan).toContain("Gmail");
    expect(plan).toContain("Google Drive");
    expect(plan).toContain("Spotify");
    expect(plan).toContain("Phone/SMS");
    expect(plan).toContain("Bank feeds");
    expect(plan.length).toBeLessThanOrEqual(900);
    expect(plan).not.toContain("Gmail is connected");
    expect(plan).not.toContain("Bank feeds: connected");
  });

  it("renders a full PA connection plan without pretending accounts are connected", () => {
    const plan = formatWhatsAppFullPaConnectionPlan();

    expect(plan).toContain("Full PA connection plan");
    expect(plan).toContain("I cannot connect private accounts without your OAuth/provider approval");
    expect(plan).toContain("Needs account setup:");
    expect(plan).toContain("Best order:");
    expect(plan).toContain("Email + calendar");
    expect(plan).toContain("Phone/SMS");
    expect(plan).toContain("Bank feeds");
    expect(plan).toContain("Needs you:");
    expect(plan.length).toBeLessThanOrEqual(1100);
    expect(plan).not.toContain("Gmail is connected");
    expect(plan).not.toContain("Bank feeds: connected");
  });

  it("renders a clear can't-do guard without pretending integrations are connected", () => {
    const guard = formatWhatsAppCantDoGuard();

    expect(guard).toContain("Can't-do guard");
    expect(guard).toContain("Cannot do live yet:");
    expect(guard).toContain("Needs setup first:");
    expect(guard).toContain("Blocked for safety:");
    expect(guard).toContain("Can queue or draft instead:");
    expect(guard).toContain("Gmail/Outlook");
    expect(guard).toContain("real calls");
    expect(guard).toContain("without confirmation");
    expect(guard).toContain("People Memory");
    expect(guard.length).toBeLessThanOrEqual(1400);
    expect(guard).not.toContain("Gmail is connected");
    expect(guard).not.toContain("Bank feeds: connected");
  });

  it("offers practical WhatsApp examples from the registry", () => {
    const examples = formatCapabilityExamples(12);

    expect(examples).toContain("Remind me to call Mukesh tomorrow at 10 am");
    expect(examples).toContain("draft sms to John saying I am late");
    expect(examples.length).toBe(12);
  });
});
