import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { createCompendiumStore } from "../preview/data.js";
import { createDemoProject, resolveDemoProject } from "../preview/demo-project.js";
import { createCompendium } from "../src/index.js";

async function demoRoot(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "compendium-demos-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return pathToFileURL(directory + path.sep);
}

test("creates a valid empty compendium and leaves an existing project intact", async t => {
  const root = await demoRoot(t);
  const { file } = await createDemoProject("new-game", root);
  const content = await readFile(file, "utf8");
  assert.deepEqual(JSON.parse(content), { id: "new-game", tabs: [], collections: [] });
  assert.deepEqual(createCompendium(JSON.parse(content)).tabs, []);
  await assert.rejects(createDemoProject("new-game", root), /already exists/);
  assert.equal(await readFile(file, "utf8"), content);
  assert.throws(() => resolveDemoProject("../somewhere", root), /project name/);
});

test("writer changes stay in the selected demo project", async t => {
  const root = await demoRoot(t);
  const first = await createDemoProject("first", root);
  const second = await createDemoProject("second", root);
  const writer = createCompendiumStore(first.file);
  await writer.saveCompendiumNavigation({ action: "add", path: [], type: "normal", title: "My rules" });

  assert.equal((await writer.readCompendium()).tabs[0].title, "My rules");
  assert.deepEqual(await createCompendiumStore(second.file).readCompendium(), {
    id: "second", tabs: [], collections: [],
  });
});

