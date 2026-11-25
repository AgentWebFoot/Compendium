import { createSpellchecker } from "../src/spellcheck.js";

export function createPreviewSpellcheck({ getCompendiumVersion, readCompendium }) {
  let cached;
  return async text => {
    const version = await getCompendiumVersion();
    if (cached?.version !== version) {
      const data = await readCompendium();
      cached = { version, check: createSpellchecker(data) };
    }
    return cached.check(text);
  };
}
