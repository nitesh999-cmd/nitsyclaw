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
    expect(client).toContain("Queued means saved");
    expect(client).toContain("Saved to Requests");
    expect(client).toContain("router.refresh");
    expect(client).toContain("This is the planning desk");
    expect(client).toContain("\\u2019");
    expect(client).toContain("Save Top 20 to Requests");
    expect(client).toContain("Save Next 50 to Requests");
    expect(client).toContain("queue_next_50_item");
    expect(client).toContain("Desktop Gateway");
    expect(client).toContain("Codex Factory");
    expect(client).toContain("Skill Store");
    expect(client).toContain("Self-Healing");
    expect(client).toContain("/addfeature");
    expect(client).toContain("Command failed. Try again shortly.");
    expect(client).toContain("Operator mission failed. Try again shortly.");
    expect(client).not.toContain("e instanceof Error ? e.message");
    expect(client).not.toContain("Request failed with HTTP");
    expect(shell).toContain('href: "/command"');
    expect(shell).toContain('label: "Command"');
  });
});
