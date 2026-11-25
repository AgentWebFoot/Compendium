const normalize = value => String(value ?? "").trim().toLowerCase().replace(/\s*\/\s*/g, " / ");

export function createPageReferences(compendium) {
  const names = new Map();

  function add(title, path, target, location) {
    for (const key of new Set([normalize(title), normalize(path.join(" / "))])) {
      if (!key) continue;
      if (!names.has(key)) names.set(key, []);
      names.get(key).push({ target, location });
    }
  }

  for (const tab of compendium.tabs) {
    const tabTarget = { tabId: tab.id };
    const tabLocation = { tab: tab.id };
    add(tab.title, [tab.title], tabTarget, tabLocation);
    const classGroups = tab.type === "classes" ? tab.classPageStructure?.groups ?? [] : [];
    const classes = new Map();
    for (const group of classGroups) {
      const label = tab.classPageLabels?.groupLabels?.[group.key] ?? group.key;
      const groupTarget = { ...tabTarget, groupId: group.key };
      const groupLocation = { ...tabLocation, subtab: group.key };
      add(label, [tab.title, label], groupTarget, groupLocation);
      for (const id of group.classes) {
        const title = tab.classPageLabels?.classLabels?.[id] ?? id;
        const path = [tab.title, label, title];
        const target = { ...groupTarget, classId: id };
        const location = { ...groupLocation, entry: id };
        add(title, path, target, location);
        if (!classes.has(id)) classes.set(id, { path, target, location });
      }
    }

    for (const entry of tab.entries) {
      const parent = classes.get(entry.class);
      if (classGroups.length && !parent) continue;
      const title = titleFor(tab, entry);
      add(title, [...(parent?.path ?? [tab.title]), title],
        { ...(parent?.target ?? tabTarget), entryId: entry.id }, parent?.location ?? tabLocation);
    }

    const navigationGroups = new Set();
    for (const section of tab.sections) {
      const subtab = section.navigationGroup ?? section;
      const sectionTarget = { ...tabTarget, sectionId: section.id };
      const sectionLocation = { ...tabLocation, subtab: subtab.id };
      if (!navigationGroups.has(subtab.id)) {
        add(subtab.title, [tab.title, subtab.title], sectionTarget, sectionLocation);
        navigationGroups.add(subtab.id);
      }
      if (section.title !== subtab.title) {
        add(section.title, [tab.title, subtab.title, section.title], sectionTarget, sectionLocation);
      }
      for (const entry of section.entries) {
        const title = titleFor(section, entry);
        const location = section.type === "normal" ? { ...sectionLocation, entry: entry.id } : sectionLocation;
        add(title, [tab.title, subtab.title, title], { ...sectionTarget, entryId: entry.id }, location);
      }
    }
  }

  return (name, origin = {}) => {
    const matches = names.get(normalize(name)) ?? [];
    return matches.find(match => match.target.tabId === origin.tabId && match.target.sectionId === origin.sectionId)
      ?? matches.find(match => match.target.tabId === origin.tabId)
      ?? matches[0];
  };
}

function titleFor(page, entry) {
  const key = page.fields?.find(field => field.isTitle)?.key;
  return String(entry[key] ?? entry.title ?? entry.name ?? entry.id);
}

