// Playwright e2e specs against the dashboard.
// With DATABASE_URL present, assert live dashboard data surfaces. Without it, assert safe fallback states.

import { test, expect } from "@playwright/test";

const hasDatabase = Boolean(process.env.DATABASE_URL);

test.describe("dashboard routes render", () => {
  test("Login page has polished owner-gated entry", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Your private personal PA" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.locator(".nc-hero")).toBeVisible();
  });

  test("Today page", async ({ page }) => {
    await page.goto("/");
    if (hasDatabase) {
      await expect(page.getByRole("heading", { name: /Life admin, sorted/ })).toBeVisible();
      await expect(page.getByTestId("today-quick-start")).toBeVisible();
    } else {
      await expect(page.getByRole("heading", { name: "Dashboard unavailable" })).toBeVisible();
      await expect(page.getByText("Database is not configured")).toBeVisible();
    }
  });

  test("Conversations page", async ({ page }) => {
    await page.goto("/conversations");
    await expect(page.getByRole("heading", { name: "Conversations" })).toBeVisible();
  });

  test("Chat page exposes home quick starts", async ({ page }) => {
    await page.goto("/chat");
    await expect(page.getByRole("heading", { name: "Chat with NitsyClaw" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Quick starts" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Find my next steps/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Check before I send/ })).toBeVisible();

    await page.getByRole("button", { name: /Plan travel day/ }).click();
    await expect(page.getByRole("textbox")).toHaveValue(/Plan my travel day/);
  });

  test("Operator command page", async ({ page }) => {
    await page.goto("/command");
    await expect(page.getByRole("heading", { name: "Plan work without losing it" })).toBeVisible();
    await expect(page.getByTestId("operator-command")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Top 20 only" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Next 50 only" })).toBeVisible();
  });

  test("Memory page", async ({ page }) => {
    await page.goto("/memory");
    await expect(page.getByRole("heading", { name: "Memory" })).toBeVisible();
  });

  test("Reminders page", async ({ page }) => {
    await page.goto("/reminders");
    await expect(page.getByRole("heading", { name: "Reminders" })).toBeVisible();
    if (!hasDatabase) {
      await expect(page.getByText("Dashboard database is not configured.")).toBeVisible();
      await expect(page.getByText("DATABASE_URL")).toHaveCount(0);
    }
  });

  test("Expenses page shows total", async ({ page }) => {
    await page.goto("/expenses");
    if (hasDatabase) {
      await expect(page.getByTestId("expenses-total")).toBeVisible();
    } else {
      await expect(page.getByRole("heading", { name: "Expenses" })).toBeVisible();
      await expect(page.getByText("Could not load expenses").first()).toBeVisible();
    }
  });

  test("Settings page lists integrations", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByTestId("settings-integrations")).toBeVisible();
  });

  test("Sidebar navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Open Chat/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Home Today" })).toHaveAttribute("aria-current", "page");
    await page.getByRole("link", { name: "Keep Remember" }).click();
    await expect(page).toHaveURL(/\/memory$/);
  });

  test("refreshed queue UI exposes status filters and update controls", async ({ page }) => {
    await page.goto("/queue");
    await expect(page.getByRole("heading", { name: "Requests" })).toBeVisible();
    await expect(page.locator(".nc-hero").getByText("Feature Queue")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "pending", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "in progress", exact: true })).toBeVisible();
    await expect(page.locator(".nc-hero")).toBeVisible();
  });

  test("mobile daily surfaces keep the main action reachable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/chat");

    await expect(page.getByRole("link", { name: "Today" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ask" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Review" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Remember" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Do" })).toHaveCount(0);
    await expect(page.getByRole("textbox")).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
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
