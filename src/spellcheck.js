import dictionary from "dictionary-en";
import nspell from "nspell";

const imageSyntax = /!\[[^\]]*\]\([^\r\n)]+\)/g;
const wordPattern = /[A-Za-z][A-Za-z'’\u002D]*/g;
const normalizeWord = word => word.replace(/’/g, "'");
const withoutImageMarkup = text => text.replace(imageSyntax, match => " ".repeat(match.length));

function addCompendiumWords(value, spellchecker) {
  if (typeof value === "string") {
    for (const [word] of withoutImageMarkup(value).matchAll(wordPattern)) {
      const normalized = normalizeWord(word);
      spellchecker.add(normalized);
      spellchecker.add(normalized.toLowerCase());
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key !== "id" && key !== "collectionId") addCompendiumWords(item, spellchecker);
    }
  }
}

export function createSpellchecker(configuration) {
  const spellchecker = nspell(dictionary);
  addCompendiumWords(configuration, spellchecker);
  return text => {
    if (typeof text !== "string" || text.length > 30_000) {
      throw new TypeError("Spellcheck text must be 30,000 characters or fewer.");
    }
    if (!text.trim()) return [];
    const issues = [];
    const revisions = new Map();
    for (const { 0: word, index: start } of withoutImageMarkup(text).matchAll(wordPattern)) {
      const normalized = normalizeWord(word);
      if (spellchecker.correct(normalized) || spellchecker.correct(normalized.toLowerCase())) continue;
      if (!revisions.has(normalized)) revisions.set(normalized, spellchecker.suggest(normalized).slice(0, 6));
      issues.push({ word, start, end: start + word.length, suggestions: revisions.get(normalized) });
      if (issues.length === 150) break;
    }
    return issues;
  };
}
