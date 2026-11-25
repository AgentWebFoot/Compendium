import { expect } from "@playwright/test";
import { previewTest as test } from "./preview-fixture.js";

test("another app mounts the packaged interface with its own data, style, and writer adapter", async ({ page, previewUrl }) => {
  await page.route("**/consumer?host=page", route => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><h1>Host application</h1><div id="first"></div><div id="second"></div>
      <script type="module">
        import { mountCompendium } from "/src/browser/index.js";
        const data = {
          tabs: [
            { id: "rules", title: "Rules", sections: [{ id: "movement", title: "Movement", collectionId: "rules" }] },
            { id: "lore", title: "Lore", collectionId: "lore" },
          ],
          collections: [
            { id: "rules", entries: [{ id: "climb", title: "Climbing", content: "Climb carefully." }] },
            { id: "lore", entries: [{ id: "port", title: "The Port", content: "A sleepy fishing village." }] },
          ],
        };
        window.comp = mountCompendium(document.querySelector("#first"), data, {
          title: "Host Rules",
          projectId: "host-first",
          stylesheets: ["/theme.css"],
          writer: {
            async saveEntry({ reference, values }) {
              window.lastSave = { reference, values };
              return { id: "port", title: "The Port", ...values };
            },
          },
        });
        mountCompendium(document.querySelector("#second"), data, { title: "Other Rules", projectId: "host-second" });
      </script>`,
  }));
  await page.route("**/theme.css", route => route.fulfill({
    contentType: "text/css",
    body: "h1 { color: rgb(0, 80, 120); }",
  }));
  await page.goto(new URL("/consumer?host=page", previewUrl).href);
  const first = page.locator("#first");
  const second = page.locator("#second");
  const heading = first.getByRole("heading", { name: "Host Rules", exact: true });
  await expect(heading).toHaveCSS("color", "rgb(0, 80, 120)");
  await expect(second.getByRole("heading", { name: "Other Rules", exact: true })).toBeVisible();
  await first.getByRole("searchbox").fill("fishing village");
  await first.getByRole("region", { name: "Search results" }).getByRole("button", { name: /The Port/ }).click();
  await expect(first.getByRole("heading", { name: "The Port", exact: true })).toBeVisible();
  await expect(second.getByRole("heading", { name: "Climbing", exact: true })).toBeVisible();
  expect(new URL(page.url()).search).toBe("?host=page");

  await first.getByRole("button", { name: "Favorite: The Port", exact: true }).click();
  await expect(first.getByRole("button", { name: "Favorites (1)", exact: true })).toBeVisible();
  await expect(second.getByRole("button", { name: "Favorites (0)", exact: true })).toBeVisible();
  await first.getByRole("button", { name: "Show Writer Tools", exact: true }).click();
  await first.getByRole("button", { name: "Edit: The Port", exact: true }).click();
  await first.getByRole("textbox", { name: "Content", exact: true }).fill("Updated by the host.");
  await first.getByRole("button", { name: "Save", exact: true }).click();
  await expect(first.getByText("Updated by the host.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.lastSave)).toEqual({
    reference: { tabId: "lore", entryId: "port" },
    values: { content: "Updated by the host." },
  });
  await page.evaluate(() => window.comp.destroy());
  await expect(heading).toHaveCount(0);
  await expect(second.getByRole("heading", { name: "Other Rules", exact: true })).toBeVisible();
});

