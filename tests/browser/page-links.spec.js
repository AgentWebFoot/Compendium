import { expect } from "@playwright/test";
import { previewTest as test } from "./preview-fixture.js";

const data = {
  tabs: [
    {
      id: "quest & lore",
      title: "Voyage",
      sections: [
        { id: "sea + stars", title: "The Seas", collectionId: "sea" },
        { id: "harbor", title: "The Harbor", collectionId: "harbor" },
      ],
    },
    {
      id: "classes",
      title: "Classes",
      type: "classes",
      classPageStructure: { groups: [{ key: "Fighters", classes: ["Scout", "Sentinel"] }] },
      collectionId: "abilities",
    },
  ],
  collections: [
    { id: "sea", entries: [{ id: "chart", title: "The Chart" }, { id: "A # Wake", title: "The Wake", content: "Follow the wake." }] },
    { id: "harbor", entries: [{ id: "docks", title: "The Docks" }] },
    { id: "abilities", entries: [{ id: "stand", class: "Sentinel", rank: 1, name: "Hold the Gate" }] },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/compendium.json", route => route.fulfill({ json: data }));
});

function urlWith(base, values) {
  const url = new URL(base);
  url.search = new URLSearchParams(values).toString();
  return url;
}

function selectedEntry(page, title) {
  return page.locator(".reading-body").getByRole("heading", { name: title, exact: true });
}

test("shares a tab, subtab, and entry by stable ID and restores them on reload", async ({ page, previewUrl }) => {
  const initial = urlWith(previewUrl, { lang: "en" });
  initial.hash = "top";
  await page.goto(initial.href);
  await expect(selectedEntry(page, "The Chart")).toBeVisible();
  await page.getByRole("button", { name: "The Wake", exact: true }).click();
  await expect(selectedEntry(page, "The Wake")).toBeVisible();

  const shared = new URL(page.url());
  expect(Object.fromEntries(shared.searchParams)).toEqual({
    lang: "en", tab: "quest & lore", subtab: "sea + stars", entry: "A # Wake",
  });
  expect(shared.hash).toBe("#top");
  await page.reload();
  await expect(selectedEntry(page, "The Wake")).toBeVisible();
});

test("opens a linked class and restores earlier entries with Back and Forward", async ({ page, previewUrl }) => {
  await page.goto(urlWith(previewUrl, { tab: "classes", subtab: "Fighters", entry: "Sentinel" }).href);
  await expect(selectedEntry(page, "Sentinel")).toBeVisible();
  await expect(selectedEntry(page, "Hold the Gate")).toBeVisible();
  await page.getByRole("button", { name: "Voyage", exact: true }).click();
  await page.getByRole("button", { name: "The Harbor", exact: true }).click();
  await expect(selectedEntry(page, "The Docks")).toBeVisible();
  await page.goBack();
  await expect(selectedEntry(page, "The Chart")).toBeVisible();
  await page.goBack();
  await expect(selectedEntry(page, "Sentinel")).toBeVisible();
  await page.goForward();
  await expect(selectedEntry(page, "The Chart")).toBeVisible();

  const search = page.getByRole("searchbox");
  await search.fill("Hold the Gate");
  await page.getByRole("region", { name: "Search results" }).getByRole("button", { name: /Hold the Gate/ }).click();
  await expect(selectedEntry(page, "Sentinel")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("entry")).toBe("Sentinel");
});

test("falls back cleanly when a shared entry is missing", async ({ page, previewUrl }) => {
  await page.goto(urlWith(previewUrl, { tab: "quest & lore", subtab: "harbor", entry: "removed" }).href);
  await expect(selectedEntry(page, "The Docks")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("entry")).toBe("docks");

  await page.getByRole("button", { name: "Full Compendium", exact: true }).click();
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({ view: "full" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Full Compendium", exact: true })).toBeVisible();
});

