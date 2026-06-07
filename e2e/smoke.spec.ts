import { test, expect } from "@playwright/test";

// Runs against the production build in guest/local mode (no Supabase env),
// so it needs no login or real API key. Verifies the app boots, a real
// interaction works, and routes render without crashing into the error UI.
test("guest mode: app boots, studio interaction works, chat route renders", async ({ page }) => {
  // Studio route renders — proves boot + router + no ErrorBoundary fallback.
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "创作工坊" })).toBeVisible();

  // Real interaction: open the character creation modal.
  await page.getByRole("button", { name: "创建" }).first().click();
  await expect(page.getByRole("heading", { name: "创建角色" })).toBeVisible();

  // Chat route renders without crashing into the error fallback.
  await page.goto("/roleplay");
  await expect(page).toHaveURL(/\/roleplay/);
  await expect(page.getByText("出错了，这个区域暂时无法显示。")).toHaveCount(0);
  await expect(page.locator("#root")).not.toBeEmpty();
});
