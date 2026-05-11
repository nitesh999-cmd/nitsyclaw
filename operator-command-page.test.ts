import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("operator command page", () => {
  test("adds a real command surface with aggressive build presets", () => {
    const page = readFileSync("apps/dashboard/src/app/command/page.tsx", "utf8");
    const client = readFileSync("apps/dashboard/src/app/command/operator-command-client.tsx", "utf8");
    const shell = readFileSync("apps/dashboard/src/app/dashboard-shell.tsx", "utf8");

    expect(page).toContain("Plan work without losing it");
    expect(page).toContain("timeoutOperatorState(1500)");
    expect(page).toContain("pendingConfirmations");
    expect(page).toContain("whatsapp-client");
    expect(page).toContain("Saved build work");
    expect(page).toContain("OPERATOR_MISSIONS.length");
    expect(page).toContain("pnpm operator:next");
    expect(page).toContain("pnpm operator:claim");
    expect(client).toContain("/api/chat");
    expect(client).toContain("/api/operator/jobs");
    expect(client).toContain("What happens here");
    expect(client).toContain("safe holding area");
    expect(client).toContain("Saved to Requests");
    expect(client).toContain("Saves only. Does not run code, send messages, or deploy.");
    expect(client).toContain("router.refresh");
    expect(client).toContain("Saved requests wait for the laptop runner");
    expect(client).toContain("\\u2019");
    expect(client).toContain("Save Top 20 only");
    expect(client).toContain("Save Next 50 only");
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
    expect(shell).toContain('label: "Work desk"');
    expect(shell).toContain('label: "Advanced"');
  });
});
