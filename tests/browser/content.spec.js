import { expect } from "@playwright/test";
import { previewTest as test } from "./preview-fixture.js";

const demoConfiguration = {
  id: "browser-test",
  tabs: [
    { id: "guide", title: "Guide", collectionId: "guide" },
    { id: "world", title: "World", sections: [
      { id: "places", title: "Places", collectionId: "places" },
      { id: "people", title: "People", collectionId: "people" },
    ] },
  ],
  collections: [
    { id: "guide", entries: [{
      id: "welcome", title: "Welcome",
      content: "Open <World>, <People>, or <World / Places / The Port>. <Unknown page>",
    }] },
    { id: "places", entries: [
      { id: "tower", title: "The Tower", content: "A tower.", color: "#336699" },
      { id: "port", title: "The Port", content: "A port." },
    ] },
    { id: "people", entries: [{ id: "keeper", title: "The Keeper", content: "A keeper." }] },
  ],
};

test.use({ writerMode: true, demoConfiguration });

test("inline references open tabs, subtabs, and a specifically qualified entry", async ({ page, previewUrl }) => {
  await page.goto(previewUrl);
  await expect(page.getByText("<Unknown page>", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Unknown page" })).toHaveCount(0);

  await page.getByRole("link", { name: "World", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The Tower", exact: true })).toBeVisible();
  await page.goBack();

  await page.getByRole("link", { name: "People", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The Keeper", exact: true })).toBeVisible();
  await page.goBack();

  const port = page.getByRole("link", { name: "World / Places / The Port", exact: true });
  const destination = new URL(await port.getAttribute("href"));
  expect(Object.fromEntries(destination.searchParams)).toEqual({ tab: "world", subtab: "places", entry: "port" });
  await port.click();
  await expect(page.getByRole("heading", { name: "The Port", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "The Port", exact: true })).toBeVisible();
});

test("uploads and displays an image through the writer server", async ({ page, previewUrl, request }) => {
  await page.route("**/writer/spellcheck", route => route.fulfill({ json: { issues: [] } }));
  await page.goto(previewUrl);
  await page.getByRole("button", { name: "Show Writer Tools" }).click();
  await page.getByRole("button", { name: "Edit: Welcome", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Content", exact: true });
  await editor.press("Control+End");

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload image to Content", exact: true }).click();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+rW2QAAAAASUVORK5CYII=", "base64");
  await (await chooser).setFiles({ name: "Map.png", mimeType: "image/png", buffer: png });
  await expect(editor).toHaveValue(/!\[Map\]\(map-[a-f0-9]{8}\.png\)/);
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const image = page.getByRole("img", { name: "Map", exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBe(1);
  const src = await image.getAttribute("src");
  const fetched = await request.get(src);
  expect(fetched.headers()["content-type"]).toBe("image/png");
  expect(await fetched.body()).toEqual(png);
  await page.reload();
  await expect(page.getByRole("img", { name: "Map", exact: true })).toBeVisible();

  const invalid = await request.post(new URL("writer/image", previewUrl).href, {
    headers: { "Content-Type": "image/png", Origin: new URL(previewUrl).origin },
    data: Buffer.from("not an image"),
  });
  expect(invalid.status()).toBe(415);
});


test("category color is editable in navigation tools and absent from the content editor", async ({ page, previewUrl }) => {
  await page.route("**/writer/spellcheck", route => route.fulfill({ json: { issues: [] } }));
  await page.goto(previewUrl);
  await page.getByRole("link", { name: "World", exact: true }).click();
  await page.getByRole("button", { name: "Show Writer Tools" }).click();

  await page.getByRole("button", { name: "Edit: The Tower", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit The Tower", exact: true });
  await expect(editor.getByLabel("Content", { exact: true })).toBeVisible();
  await expect(editor.getByLabel("Color", { exact: true })).toHaveCount(0);
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator("#content").getByText("Color", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Edit category", exact: true }).click();
  const navigation = page.getByRole("dialog", { name: "Edit category", exact: true });
  await expect(navigation.getByLabel("Color", { exact: true })).toHaveValue("#336699");
});


test("writers can apply and remove inline formatting and save it alongside page links", async ({ page, previewUrl }) => {
  await page.route("**/writer/spellcheck", route => route.fulfill({ json: { issues: [] } }));
  await page.goto(previewUrl);
  await page.getByRole("link", { name: "People", exact: true }).click();
  await page.getByRole("button", { name: "Show Writer Tools" }).click();
  await page.getByRole("button", { name: "Edit: The Keeper", exact: true }).click();

  const editor = page.getByRole("textbox", { name: "Content", exact: true });
  const toolbar = page.getByRole("group", { name: "Format Content", exact: true });
  await editor.fill("Bold text, slanted text, marked text, crossed text, ++**both**++, and <Places>.");
  const select = text => editor.evaluate((input, phrase) => {
    const start = input.value.indexOf(phrase);
    input.focus();
    input.setSelectionRange(start, start + phrase.length);
  }, text);
  const button = title => toolbar.getByRole("button", { name: title, exact: true });

  await select("Bold text");
  await button("Bold").click();
  await button("Italic").click();
  await expect(editor).toHaveValue(/\*\*\*Bold text\*\*\*/);
  await button("Italic").click();
  await expect(editor).toHaveValue(/\*\*Bold text\*\*,/);
  await select("slanted text");
  await editor.press("Control+i");
  await select("marked text");
  await button("Underline").click();
  await select("crossed text");
  await button("Strikethrough").click();
  await select("<Places>");
  await button("Bold").click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const content = page.locator("#content");
  await expect(content.locator("strong").getByText("Bold text", { exact: true })).toBeVisible();
  await expect(content.locator("em").getByText("slanted text", { exact: true })).toBeVisible();
  await expect(content.locator("u").getByText("marked text", { exact: true })).toBeVisible();
  await expect(content.locator("s").getByText("crossed text", { exact: true })).toBeVisible();
  await expect(content.locator("u strong").getByText("both", { exact: true })).toBeVisible();
  await page.reload();
  await expect(content.locator("strong").getByRole("link", { name: "Places", exact: true })).toBeVisible();
  await content.getByRole("link", { name: "Places", exact: true }).click();
  await expect(content.getByRole("heading", { name: "The Tower", exact: true })).toBeVisible();
});

