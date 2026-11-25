import { expect } from "@playwright/test";
import { previewTest as test } from "./preview-fixture.js";

const demoConfiguration = {
  id: "browser-test",
  tabs: [{ id: "guide", title: "Guide", collectionId: "guide" }],
  collections: [{ id: "guide", entries: [{
    id: "welcome", title: "Welcome", content: "# Overview\n## Details\n### Notes",
  }] }],
};

test.use({ writerMode: true, demoConfiguration });

test("writers can set fonts and sizes for titles and prose headings and restore theme defaults", async ({ page, previewUrl }) => {
  await page.goto(previewUrl);
  const title = page.getByRole("heading", { name: "Compendium Preview", exact: true });
  const entry = page.getByRole("heading", { name: "Welcome", exact: true });
  const heading = page.getByRole("heading", { name: "Details", exact: true });
  const originalSize = await heading.evaluate(node => getComputedStyle(node).fontSize);
  const originalColor = await heading.evaluate(node => getComputedStyle(node).color);

  const guideButton = page.getByRole("button", { name: "Style Guide", exact: true });
  await expect(guideButton).toHaveCount(0);
  await page.getByRole("button", { name: "Show Writer Tools", exact: true }).click();
  await guideButton.click();
  const guide = page.getByRole("dialog", { name: "Style Guide" });
  await guide.getByLabel("Compendium title font", { exact: true }).selectOption("arial");
  await guide.getByLabel("Compendium title size (px)", { exact: true }).fill("34");
  await guide.getByLabel("Entry and class titles size (px)", { exact: true }).fill("25");
  await guide.getByLabel("Text heading 2 (##) font", { exact: true }).selectOption("georgia");
  await guide.getByLabel("Text heading 2 (##) size (px)", { exact: true }).fill("27");
  await guide.getByLabel("Text heading 2 (##) color", { exact: true }).fill("#3366aa");
  await expect(guide.getByText("Text heading 2 (##)", { exact: true })).toHaveCSS("font-size", "27px");
  await expect(guide.getByText("Text heading 2 (##)", { exact: true })).toHaveCSS("color", "rgb(51, 102, 170)");
  await guide.getByRole("button", { name: "Save", exact: true }).click();

  await expect(title).toHaveCSS("font-family", /Arial/);
  await expect(title).toHaveCSS("font-size", "34px");
  await expect(entry).toHaveCSS("font-size", "25px");
  await expect(heading).toHaveCSS("font-family", /Georgia/);
  await expect(heading).toHaveCSS("font-size", "27px");
  await expect(heading).toHaveCSS("color", "rgb(51, 102, 170)");
  await page.reload();
  await expect(heading).toHaveCSS("font-size", "27px");
  await expect(heading).toHaveCSS("color", "rgb(51, 102, 170)");

  await page.getByRole("button", { name: "Show Writer Tools", exact: true }).click();
  await guideButton.click();
  await guide.getByRole("button", { name: "Reset Text heading 2 (##) size", exact: true }).click();
  await expect(guide.getByLabel("Text heading 2 (##) size (px)", { exact: true })).toHaveValue("");
  await guide.getByRole("button", { name: "Save", exact: true }).click();
  await expect(heading).toHaveCSS("font-size", originalSize);
  await expect(heading).toHaveCSS("font-family", /Georgia/);
  await expect(heading).toHaveCSS("color", "rgb(51, 102, 170)");
  await expect(title).toHaveCSS("font-size", "34px");

  await guideButton.click();
  await guide.getByRole("button", { name: "Use default color for Text heading 2 (##)", exact: true }).click();
  await guide.getByRole("button", { name: "Save", exact: true }).click();
  await expect(heading).toHaveCSS("color", originalColor);
  await expect(heading).toHaveCSS("font-family", /Georgia/);
});

