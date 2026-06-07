import { test, expect } from "@playwright/test";

// Guest/local mode (no Supabase env): import a V2 JSON card and confirm it lands.
test("guest can import a V2 JSON character card", async ({ page }) => {
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "创作工坊" })).toBeVisible();

  const card = JSON.stringify({
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "ImportedAria",
      description: "a fox spirit",
      personality: "kind",
      scenario: "tavern",
      first_mes: "hi",
      mes_example: "",
      tags: ["rpg"],
    },
  });

  // Set the hidden file input directly (clicking the button opens a native dialog).
  await page.setInputFiles('input[type="file"]', {
    name: "aria.json",
    mimeType: "application/json",
    buffer: Buffer.from(card, "utf-8"),
  });

  // Preview modal appears with the parsed name.
  await expect(page.getByText("ImportedAria")).toBeVisible();

  // Confirm import (the modal's 导入 button is the last one in the DOM).
  await page.getByRole("button", { name: "导入" }).last().click();

  // Character lands in the list.
  await expect(page.getByRole("heading", { name: "ImportedAria" })).toBeVisible();
});
