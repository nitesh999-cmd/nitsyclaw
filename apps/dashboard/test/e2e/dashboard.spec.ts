// Playwright e2e specs against the dashboard.
// With DATABASE_URL present, assert live dashboard data surfaces. Without it, assert safe fallback states.

import { test, expect } from "@playwright/test";

const hasDatabase = Boolean(process.env.DATABASE_URL);

async function visibleInteractiveCenterMismatches(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    function describe(el: Element) {
      const rect = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
        href: el.getAttribute("href"),
        type: el.getAttribute("type"),
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      };
    }

    const mobileNavTop = document.querySelector(".nc-mobile-nav")?.getBoundingClientRect().top ?? innerHeight;

    return Array.from(document.querySelectorAll("a,button,input,select,textarea"))
      .filter((el) => !el.closest(".nc-mobile-nav"))
      .map((el, index) => {
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const centerInViewport = x >= 0 && x <= innerWidth && y >= 0 && y <= Math.min(innerHeight, mobileNavTop);
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right > 0 &&
          rect.left < innerWidth &&
          rect.bottom > 0 &&
          rect.top < innerHeight &&
          centerInViewport;
        const top = visible ? document.elementFromPoint(x, y) : null;
        const interactiveTop = top ? top.closest("a,button,input,select,textarea") : null;
        return {
          index,
          current: describe(el),
          visible,
          centerTop: interactiveTop ? describe(interactiveTop) : null,
          selfAtCenter: interactiveTop === el,
        };
      })
      .filter((item) => item.visible && !item.selfAtCenter);
  });
}

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

  test("Onboarding page explains first steps in plain language", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "Set up my PA" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Start first-day setup" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Answer once. Use everywhere." })).toBeVisible();
    await expect(page.getByLabel("Home base")).toHaveValue(/Melbourne/);
    await expect(page.getByLabel("Default currency")).toHaveValue("AUD");
    await expect(page.getByLabel("Reply language")).toHaveValue("English");
    await expect(page.getByLabel("First three jobs to automate")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save PA profile" })).toBeVisible();
    await expect(page.getByText("It does not connect Gmail, SMS, bank feeds, photos, or any outside account.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start with one of these" })).toBeVisible();
    await expect(page.getByText("No AI knowledge needed")).toBeVisible();
  });

  test("Setup page explains provider setup without fake live claims", async ({ page }) => {
    await page.goto("/setup");
    await expect(page.getByRole("heading", { name: "Connect one useful thing at a time." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Build trust before broad access" })).toBeVisible();
    await expect(page.getByText("Works without more setup")).toBeVisible();
    await expect(page.getByText("Do not fake these")).toBeVisible();
    await expect(page.getByText("Real email sending")).toBeVisible();
    await expect(page.getByText("Bank feeds and live account data")).toBeVisible();
    await expect(page.getByRole("link", { name: "Manage connections" })).toBeVisible();
  });

  test("Privacy command center exposes safe data controls", async ({ page }) => {
    await page.goto("/privacy-center");
    await expect(page.getByRole("heading", { name: /Your data, controls, and trust checks/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Export my data" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Delete controls" })).toBeVisible();
    await expect(page.getByText("Tokens are never shown")).toBeVisible();
    await expect(page.getByText("Payloads redacted")).toBeVisible();
  });

  test("Health page exposes admin observability", async ({ page }) => {
    await page.goto("/health");
    await expect(page.getByTestId("admin-observability")).toBeVisible();
    await expect(page.getByText("Queue age")).toBeVisible();
    await expect(page.getByText("Route failures")).toBeVisible();
    await expect(page.getByText("Auth lockouts")).toBeVisible();
  });

  test("Sidebar navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Open Chat/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Home Today" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "Start PA setup" })).toBeVisible();
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
    await expect(page.getByRole("link", { name: "Requests" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Privacy" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Do" })).toHaveCount(0);
    await expect(page.getByRole("textbox")).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test("mobile visible controls are not covered by the bottom navigation", async ({ context }) => {
    test.setTimeout(60_000);

    for (const route of ["/", "/chat"]) {
      const page = await context.newPage();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const mismatches = await visibleInteractiveCenterMismatches(page);
      expect(mismatches, `${route} has covered or misaligned tap targets`).toEqual([]);
      await page.close();
    }
  });

  test("mobile dashboard exposes daily operator actions", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.getByTestId("mobile-dashboard-actions")).toBeVisible();
    await expect(page.getByTestId("mobile-dashboard-actions").getByRole("link", { name: /Ask/ })).toBeVisible();
    await expect(page.getByTestId("mobile-dashboard-actions").getByRole("link", { name: /Review/ })).toBeVisible();
    await expect(page.getByTestId("mobile-dashboard-actions").getByRole("link", { name: /Reminders/ })).toBeVisible();
    await expect(page.getByTestId("mobile-dashboard-actions").getByRole("link", { name: /Requests/ })).toBeVisible();
    await expect(page.getByTestId("mobile-dashboard-actions").getByRole("link", { name: /Health/ })).toBeVisible();
    await expect(page.getByTestId("mobile-dashboard-actions").getByRole("link", { name: /WhatsApp/ })).toBeVisible();
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
