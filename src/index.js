const pageTypes = new Set(["normal", "grid", "table", "classes"]);

function indexById(items, label) {
  const index = new Map();
  for (const item of items) {
    const id = item?.id;
    if (typeof id !== "string" || !id.trim() || id !== id.trim()) {
      throw new TypeError(`${label} must have a non-empty ID without surrounding whitespace.`);
    }
    if (index.has(id)) {
      throw new TypeError(`Duplicate ${label.toLowerCase()} ID: ${id}`);
    }
    index.set(id, item);
  }
  return index;
}

function resolvePage(page, collections, fallbackType) {
  const type = page.type ?? fallbackType;
  if (!pageTypes.has(type)) {
    throw new TypeError(`Unknown page type for "${page.id}": ${type}`);
  }

  const entries = page.collectionId === undefined ? new Map() : collections.get(page.collectionId);
  if (!entries) {
    throw new TypeError(`Unknown collection for "${page.id}": ${page.collectionId}`);
  }

  return {
    page: { ...page, type, entries: [...entries.values()] },
    entries,
  };
}

/**
 * Resolve a project's layout and collections. Build a new view after changing
 * the project configuration or replacing its data.
 */
export function createCompendium({ tabs, collections = [] }) {
  if (!Array.isArray(tabs)) throw new TypeError("Compendium data must contain a tabs array.");
  const collectionsById = new Map();
  for (const [id, collection] of indexById(collections, "Collection")) {
    collectionsById.set(id, indexById(collection.entries, `Entry in collection "${id}"`));
  }

  const tabsById = new Map();
  for (const [id, tab] of indexById(tabs, "Tab")) {
    const resolved = resolvePage(tab, collectionsById, "normal");
    const sections = new Map();
    for (const [sectionId, section] of indexById(tab.sections ?? [], `Section in tab "${id}"`)) {
      sections.set(sectionId, resolvePage(section, collectionsById, resolved.page.type));
    }
    resolved.page.sections = [...sections.values()].map(section => section.page);
    tabsById.set(id, { ...resolved, sections });
  }

  return {
    tabs: [...tabsById.values()].map(tab => tab.page),
    resolveEntry({ tabId, sectionId, entryId }) {
      const tab = tabsById.get(tabId);
      const target = sectionId === undefined ? tab : tab?.sections.get(sectionId);
      const entry = target?.entries.get(entryId);
      if (!entry) return null;
      return { tab: tab.page, section: sectionId === undefined ? null : target.page, entry };
    },
  };
}
