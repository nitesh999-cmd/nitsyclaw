// Playwright e2e specs against the dashboard.
// Skipped in CI when DATABASE_URL isn't set; the pages render gracefully without it.

import { test, expect } from "@playwright/test";

test.describe("dashboard routes render", () => {
  test("Today page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  });

  test("Conversations page", async ({ page }) => {
    await page.goto("/conversations");
    await expect(page.getByRole("heading", { name: "Conversations" })).toBeVisible();
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
    await page.getByRole("link", { name: "Memory" }).click();
    await expect(page).toHaveURL(/\/memory$/);
  });
});
