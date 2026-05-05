// Playwright e2e specs against the dashboard.
// Skipped in CI when DATABASE_URL isn't set; the pages render gracefully without it.

import { test, expect } from "@playwright/test";

test.describe("dashboard routes render", () => {
  test("Login page has polished owner-gated entry", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Personal life admin" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.locator(".nc-hero")).toBeVisible();
  });

  test("Today page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  });

  test("Conversations page", async ({ page }) => {
    await page.goto("/conversations");
    await expect(page.getByRole("heading", { name: "Conversations" })).toBeVisible();
  });

  test("Operator command page", async ({ page }) => {
    await page.goto("/command");
    await expect(page.getByRole("heading", { name: "Operator Command" })).toBeVisible();
    await expect(page.getByTestId("operator-command")).toBeVisible();
    await expect(page.getByRole("button", { name: "Queue All 20" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Queue Next 50" })).toBeVisible();
  });

  test("Memory page", async ({ page }) => {
    await page.goto("/memory");
    await expect(page.getByRole("heading", { name: "Memory" })).toBeVisible();
  });

  test("Reminders page", async ({ page }) => {
    await page.goto("/reminders");
    await expect(page.getByRole("heading", { name: "Reminders" })).toBeVisible();
  });

  test("Expenses page shows total", async ({ page }) => {
    await page.goto("/expenses");
    await expect(page.getByTestId("expenses-total")).toBeVisible();
  });

  test("Settings page lists integrations", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByTestId("settings-integrations")).toBeVisible();
  });

  test("Sidebar navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Open Chat/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Today/ })).toHaveAttribute("aria-current", "page");
    await page.getByRole("link", { name: "Memory" }).click();
    await expect(page).toHaveURL(/\/memory$/);
  });

  test("refreshed queue UI exposes status filters and update controls", async ({ page }) => {
    await page.goto("/queue");
    await expect(page.getByRole("heading", { name: "Feature Queue" })).toBeVisible();
    await expect(page.getByRole("link", { name: "pending" })).toBeVisible();
    await expect(page.getByRole("link", { name: "in progress" })).toBeVisible();
    await expect(page.locator(".nc-hero")).toBeVisible();
  });

  test("blocks cross-origin destructive API posts", async ({ request }) => {
    const response = await request.post("/api/data/delete", {
      headers: { origin: "https://evil.example" },
      form: {
        scope: "all",
        confirm: "DELETE ALL NITSYCLAW DATA",
      },
    });

    expect(response.status()).toBe(403);
    await expect(response.text()).resolves.toContain("Invalid request origin");
  });
});
