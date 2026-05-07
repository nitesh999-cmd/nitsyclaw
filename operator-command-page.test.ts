import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("operator command page", () => {
  test("adds a real command surface with aggressive build presets", () => {
    const page = readFileSync("apps/dashboard/src/app/command/page.tsx", "utf8");
    const client = readFileSync("apps/dashboard/src/app/command/operator-command-client.tsx", "utf8");
    const shell = readFileSync("apps/dashboard/src/app/dashboard-shell.tsx", "utf8");

    expect(page).toContain("Operator Command");
    expect(page).toContain("timeoutOperatorState(1500)");
    expect(page).toContain("pendingConfirmations");
    expect(page).toContain("whatsapp-client");
    expect(page).toContain("Home upgrades");
    expect(page).toContain("OPERATOR_MISSIONS.length");
    expect(page).toContain("pnpm operator:next");
    expect(page).toContain("pnpm operator:claim");
    expect(client).toContain("/api/chat");
    expect(client).toContain("/api/operator/jobs");
    expect(client).toContain("What this page does");
    expect(client).toContain("Queuing does not build, run code, or deploy by itself");
    expect(client).toContain("This is the planning desk");
    expect(client).toContain("\\u2019");
    expect(client).toContain("Queue Top 20 requests");
    expect(client).toContain("Queue Next 50 requests");
    expect(client).toContain("queue_next_50_item");
    expect(client).toContain("Desktop Gateway");
    expect(client).toContain("Codex Factory");
    expect(client).toContain("Skill Store");
    expect(client).toContain("Self-Healing");
    expect(client).toContain("/addfeature");
    expect(shell).toContain('href: "/command"');
    expect(shell).toContain('label: "Command"');
  });
});
