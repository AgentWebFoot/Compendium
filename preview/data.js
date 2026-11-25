import { randomUUID } from "node:crypto";
import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createCompendium } from "../src/index.js";
import { changeNavigation } from "../src/navigation.js";
import { normalizeTypography } from "../src/typography.js";

export function createCompendiumStore(compendiumFile) {
  let pendingSave = Promise.resolve();

  async function readCompendium() {
    return JSON.parse((await readFile(compendiumFile, "utf8")).replace(/^\uFEFF/, ""));
  }

  async function getCompendiumVersion() {
    const file = await stat(compendiumFile);
    return `${file.mtimeMs}:${file.size}`;
  }
  function saveCompendium(update) {
    const save = pendingSave.then(async () => {
      const data = await readCompendium();
      const result = update(data);
      if (!result) return null;

      const temp = new URL(`compendium-${randomUUID()}.tmp`, compendiumFile);
      try {
        await writeFile(temp, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
        await rename(temp, compendiumFile);
      } finally {
        await rm(temp, { force: true });
      }
      return result;
    });
    pendingSave = save.catch(() => {});
    return save;
  }


  function saveCompendiumEntry(reference, values) {
    return saveCompendium(data => {
      const source = createCompendium(data).resolveEntry(reference);
      if (!source) return null;

      for (const [key, value] of Object.entries(values)) {
        if (key === "id" || key === "__proto__" || !Object.hasOwn(source.entry, key)) {
          throw new TypeError(`Invalid entry field: ${key}`);
        }
        if (typeof value !== typeof source.entry[key]
          || Array.isArray(value) !== Array.isArray(source.entry[key])
          || (value === null) !== (source.entry[key] === null)) {
          throw new TypeError(`Keep the original data type for "${key}".`);
        }
        source.entry[key] = value;
      }

      return source.entry;
    });
  }

  function saveCompendiumNavigation(change) {
    return saveCompendium(data => {
      changeNavigation(data, change);
      createCompendium(data);
      return data;
    });
  }

  function deleteCompendiumAbility(reference) {
    return saveCompendium(data => {
      const source = createCompendium(data).resolveEntry(reference);
      if (!source) return null;
      if (source.section || source.tab.type !== "classes" || typeof source.entry.class !== "string") {
        throw new TypeError("Only class abilities can be deleted here.");
      }
      const collection = data.collections.find(item => item.id === source.tab.collectionId);
      collection.entries = collection.entries.filter(entry => entry.id !== reference.entryId);
      return data;
    });
  }

  function saveCompendiumTypography(settings) {
    return saveCompendium(data => {
      const typography = normalizeTypography(settings);
      if (Object.keys(typography).length) data.typography = typography;
      else delete data.typography;
      return data;
    });
  }

  return { readCompendium, getCompendiumVersion, saveCompendiumEntry, saveCompendiumNavigation,
    deleteCompendiumAbility, saveCompendiumTypography };
}
