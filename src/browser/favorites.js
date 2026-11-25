export function favoriteKey({ tabId, sectionId, entryId, block }) {
  return JSON.stringify([tabId, sectionId, entryId, block?.field, block?.index]);
}

export function loadFavorites(projectId) {
  const storageKey = `compendium-preview:favorites:${projectId}`;
  let entries = [];
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    if (Array.isArray(stored)) {
      entries = stored.filter(item => typeof item?.tabId === "string" && typeof item.entryId === "string");
    }
  } catch {
    // A browser with storage disabled can still keep favorites for this page.
  }
  const favorites = new Map(entries.map(item => [favoriteKey(item), item]));

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...favorites.values()]));
    } catch {
      // Keep the current in-memory selection if saving is unavailable.
    }
  }

  return {
    get size() { return favorites.size; },
    values: () => favorites.values(),
    has: item => favorites.has(favoriteKey(item)),
    toggle(item) {
      const key = favoriteKey(item);
      if (!favorites.delete(key)) {
        favorites.set(key, item);
        save();
        return true;
      }
      save();
      return false;
    },
  };
}

