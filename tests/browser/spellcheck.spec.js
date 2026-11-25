import { expect } from "@playwright/test";
import { previewTest as test } from "./preview-fixture.js";

const words = { accomodation: "accommodation", recieve: "receive", begining: "beginning", seperate: "separate" };
const filler = "The ship returned to the harbor before sunrise and waited for the rest of the fleet to arrive.";
const paragraph = index => `\tPassage ${index}. ${filler} ${filler} ${filler}`;
const fixture = Array.from({ length: 95 }, (_, index) => {
  const word = { 0: "accomodation", 28: "recieve", 59: "begining", 94: "seperate" }[index];
  return word ? `\tThe crew will ${word} the supplies. ${filler}` : paragraph(index);
}).join("\n\n");

async function openEditor(page, url, viewport) {
  await page.setViewportSize(viewport);
  await page.route("**/compendium.json", route => route.fulfill({
    headers: { "X-Compendium-Writer": "true" },
    json: {
      tabs: [{ id: "lore", title: "Lore", type: "normal", collectionId: "lore" }],
      collections: [{ id: "lore", entries: [{ id: "notes", title: "Voyage Notes", content: fixture }] }],
    },
  }));
  await page.route("**/writer/spellcheck", route => {
    const { text } = route.request().postDataJSON();
    const issues = [...text.matchAll(/accomodation|recieve|begining|seperate/g)].map(({ 0: word, index: start }) => ({
      word, start, end: start + word.length, suggestions: [words[word]],
    }));
    return route.fulfill({ json: { issues } });
  });
  await page.goto(url);
  await page.getByRole("button", { name: "Show Writer Tools", exact: true }).click();
  await page.getByRole("button", { name: "Edit: Voyage Notes", exact: true }).click();
  await expect(page.locator(".spellcheck-mirror mark")).toHaveCount(4);
  return page.getByRole("textbox", { name: "Content", exact: true });
}

async function pointOnWord(page, textarea, word) {
  const mark = page.locator(".spellcheck-mirror mark").filter({ hasText: word });
  await mark.evaluate(node => {
    const mirror = node.parentElement;
    const input = mirror.previousElementSibling;
    const markRect = node.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    input.scrollTop += markRect.top - mirrorRect.top - input.clientHeight / 3;
  });

  await expect.poll(() => textarea.evaluate(input => input.nextElementSibling.scrollTop - input.scrollTop))
    .toBe(0);
  const bounds = await mark.boundingBox();
  const field = await textarea.boundingBox();
  const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  expect(point.y).toBeGreaterThan(field.y);
  expect(point.y).toBeLessThan(field.y + field.height);
  return point;
}

async function expectUnderlineOnWord(page, textarea, word) {
  const point = await pointOnWord(page, textarea, word);
  await page.mouse.click(point.x, point.y);
  const value = await textarea.inputValue();
  const start = value.indexOf(word);
  const caret = await textarea.evaluate(input => input.selectionStart);
  expect(caret, `Clicking the underline for "${word}" should place the native textarea caret inside that word.`)
    .toBeGreaterThan(start);
  expect(caret).toBeLessThan(start + word.length);
  return point;
}

test("underlines match native textarea positions at the top and far down a long entry", async ({ page, previewUrl }) => {
  const textarea = await openEditor(page, previewUrl, { width: 1037, height: 850 });
  for (const word of Object.keys(words)) {
    await expectUnderlineOnWord(page, textarea, word);
  }
  const point = await expectUnderlineOnWord(page, textarea, "seperate");
  await page.mouse.click(point.x, point.y, { button: "right" });
  await page.getByRole("dialog", { name: "Spelling suggestions" })
    .getByRole("button", { name: "separate", exact: true }).click();
  await expect(textarea).toHaveValue(fixture.replace("seperate", "separate"));
});

test("underlines realign after horizontal reflow and a vertical editor resize", async ({ page, previewUrl }) => {
  const textarea = await openEditor(page, previewUrl, { width: 1037, height: 850 });
  await expectUnderlineOnWord(page, textarea, "recieve");
  await page.setViewportSize({ width: 421, height: 790 });
  await expectUnderlineOnWord(page, textarea, "begining");

  const { x, y, width, height } = await textarea.boundingBox();
  await page.mouse.move(x + width - 4, y + height - 4);
  await page.mouse.down();
  await page.mouse.move(x + width - 34, y + height + 55, { steps: 8 });
  await page.mouse.up();
  const after = await textarea.boundingBox();
  expect(after.width).toBe(width);
  expect(after.height).toBeGreaterThan(height);
  await expectUnderlineOnWord(page, textarea, "seperate");
});

