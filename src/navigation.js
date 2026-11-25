const types = ["normal", "grid", "table", "classes"];

function item(id, title, color, value) {
  return { id, title, color, value };
}

function listPages(pages) {
  return pages.map(page => item(page.id, page.title, page.color, page));
}

function groupedSections(sections) {
  const groups = new Map();
  for (const section of sections) {
    const group = section.navigationGroup ?? section;
    if (!groups.has(group.id)) groups.set(group.id, item(group.id, group.title, group.color, []));
    groups.get(group.id).value.push(section);
  }
  return [...groups.values()];
}

function collectionFor(data, page) {
  return data.collections?.find(collection => collection.id === page.collectionId);
}

function setEntries(data, page, entries) {
  const collection = collectionFor(data, page);
  const users = data.tabs.flatMap(tab => [tab, ...(tab.sections ?? [])])
    .filter(view => view.collectionId === page.collectionId);
  if (collection && users.length === 1) {
    collection.entries = entries;
    return;
  }
  const id = `collection-${crypto.randomUUID()}`;
  page.collectionId = id;
  (data.collections ??= []).push({ id, entries });
}

function updateClassList(tab, previous, next, kind) {
  const labels = tab.classPageLabels ??= {};
  const colors = tab.classPageColors ??= {};
  const names = labels[`${kind}Labels`] ??= {};
  const accents = colors[kind] ??= {};
  for (const entry of previous) {
    delete names[entry.id];
    delete accents[entry.id];
  }
  for (const entry of next) {
    Object.defineProperty(names, entry.id, { value: entry.title, enumerable: true, configurable: true, writable: true });
    if (entry.color) {
      Object.defineProperty(accents, entry.id, { value: entry.color, enumerable: true, configurable: true, writable: true });
    }
  }
}

function discardRemovedClassAbilities(data, tab, before) {
  const after = new Set(tab.classPageStructure.groups.flatMap(group => group.classes));
  const removed = new Set(before.filter(id => !after.has(id)));
  const entries = collectionFor(data, tab)?.entries;
  if (removed.size && entries?.some(entry => removed.has(entry.class))) {
    setEntries(data, tab, entries.filter(entry => !removed.has(entry.class)));
  }
}

function classLevel(data, tab, groupId) {
  const groups = tab.classPageStructure.groups;
  const before = groups.flatMap(group => group.classes);
  const labels = tab.classPageLabels;
  const colors = tab.classPageColors;
  if (groupId === undefined) {
    const items = groups.map(group => item(group.key, labels?.groupLabels?.[group.key] ?? group.key,
      colors?.group?.[group.key], group));
    return {
      items,
      create: id => ({ key: id, classes: [] }),
      commit(next) {
        tab.classPageStructure.groups = next.map(entry => entry.value);
        updateClassList(tab, items, next, "group");
        discardRemovedClassAbilities(data, tab, before);
      },
    };
  }
  const group = groups.find(candidate => candidate.key === groupId);
  if (!group) return null;
  const items = group.classes.map(id => item(id, labels?.classLabels?.[id] ?? id, colors?.class?.[id], id));
  return {
    items,
    create: id => id,
    commit(next) {
      group.classes = next.map(entry => entry.value);
      const remaining = new Set(tab.classPageStructure.groups.flatMap(candidate => candidate.classes));
      updateClassList(tab, items.filter(entry => !remaining.has(entry.id)), next, "class");
      for (const entry of next) {
        if (!entry.color && tab.classPageColors?.class) delete tab.classPageColors.class[entry.id];
      }
      discardRemovedClassAbilities(data, tab, before);
    },
  };
}

function levelFor(data, path) {
  const [tabId, subtabId] = path;
  if (!path.length) {
    return {
      items: listPages(data.tabs),
      types,
      create: (id, type) => type === "classes"
        ? { id, type, classPageStructure: { groups: [] } } : { id, type, sections: [] },
      commit: next => { data.tabs = next.map(entry => ({ ...entry.value, title: entry.title, color: entry.color })); },
    };
  }
  const tab = data.tabs.find(candidate => candidate.id === tabId);
  if (!tab) return null;
  if (tab.type === "classes" && tab.classPageStructure) return classLevel(data, tab, subtabId);
  const groups = groupedSections(tab.sections ?? []);
  if (path.length === 1) {
    return {
      items: groups,
      types: types.slice(0, 3),
      create: (id, type) => [{ id, type }],
      commit: next => {
        tab.sections = next.flatMap(entry => entry.value.map(section => section.navigationGroup
          ? { ...section, navigationGroup: { id: entry.id, title: entry.title, color: entry.color } }
          : { ...section, title: entry.title, color: entry.color }));
      },
    };
  }
  const sections = groups.find(group => group.id === subtabId)?.value;
  if (sections?.length !== 1 || (sections[0].type ?? tab.type ?? "normal") !== "normal") return null;
  const section = sections[0];
  const titleKey = entry => Object.hasOwn(entry, "title") ? "title" : "name";
  return {
    items: (collectionFor(data, section)?.entries ?? [])
      .map(entry => item(entry.id, entry[titleKey(entry)] ?? entry.id, entry.color, entry)),
    create: id => ({ id, title: "", content: "" }),
    commit: next => setEntries(data, section, next.map(entry => ({
      ...entry.value, [titleKey(entry.value)]: entry.title, color: entry.color,
    }))),
  };
}

export function getNavigation(data, path = []) {
  const level = levelFor(data, path);
  if (!level) return null;
  return {
    types: level.types,
    items: level.items.map(({ id, title, color }) => ({
      id, title, color,
      children: path.length < 2 ? getNavigation(data, [...path, id]) : null,
    })),
  };
}

export function changeNavigation(data, change) {
  const { action, path, id, type, direction, targetId } = change ?? {};
  if (!Array.isArray(path) || path.length > 2 || path.some(key => typeof key !== "string")) {
    throw new TypeError("Choose a valid navigation level.");
  }
  const level = levelFor(data, path);
  if (!level) throw new TypeError("This page does not have that navigation level.");
  const next = [...level.items];
  const index = next.findIndex(entry => entry.id === id);

  if (action === "add" || action === "rename") {
    const title = typeof change.title === "string" ? change.title.trim() : "";
    const color = change.color ?? "";
    if (!title || title.length > 120) throw new TypeError("Enter a name of 1 to 120 characters.");
    if (color !== "" && (typeof color !== "string" || !/^#[\da-f]{6}$/i.test(color))) {
      throw new TypeError("Choose a valid color.");
    }
    if (action === "add") {
      if (level.types && !level.types.includes(type)) throw new TypeError("Choose a valid page type.");
      const key = crypto.randomUUID();
      next.push(item(key, title, color, level.create(key, type)));
    } else {
      if (index < 0) throw new TypeError("That item no longer exists.");
      next[index] = { ...next[index], title, color };
    }
  } else if (action === "remove" && index >= 0) {
    next.splice(index, 1);
  } else if (action === "move" && index >= 0 && typeof targetId === "string") {
    const target = next.findIndex(entry => entry.id === targetId);
    if (target < 0) throw new TypeError("Choose an item in the same list.");
    next.splice(target, 0, ...next.splice(index, 1));
  } else if (action === "move" && index >= 0 && [1, -1].includes(direction)) {
    const target = index + direction;
    if (target >= 0 && target < next.length) [next[index], next[target]] = [next[target], next[index]];
  } else {
    throw new TypeError("Choose an existing navigation item and a valid action.");
  }
  level.commit(next);
  return data;
}

