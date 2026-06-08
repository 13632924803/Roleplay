import { test, expect } from "@playwright/test";

// Guest/local mode: import a standalone lorebook on the worldbook tab.
test("guest can import a standalone lorebook", async ({ page }) => {
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "创作工坊" })).toBeVisible();

  // Switch to the worldbook tab (the button label includes a count pill).
  await page.getByRole("button", { name: /世界书/ }).first().click();

  const lore = JSON.stringify({
    name: "ImportedLore",
    entries: { "0": { key: ["dragon"], content: "a big dragon", order: 1, constant: true } },
  });
  // The worldbook input is the one accepting only .json (character input accepts .png/.charx too).
  await page.setInputFiles('input[accept=".json"]', {
    name: "lore.json",
    mimeType: "application/json",
    buffer: Buffer.from(lore, "utf-8"),
  });

  await expect(page.getByText("ImportedLore")).toBeVisible();
  await page.getByRole("button", { name: "导入" }).last().click(); // confirm in modal
  await expect(page.getByText("ImportedLore")).toBeVisible(); // lands in the list
});
