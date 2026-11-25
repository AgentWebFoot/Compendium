const originalTabs = new Set(["lore", "classes", "equipment", "conditions"]);

function searchText(values) {
  if (Array.isArray(values)) return values.map(searchText).join(" ");
  if (values && typeof values === "object") return searchText(Object.values(values));
  return String(values ?? "");
}

function equipmentTerms(entry, sectionId) {
  switch (sectionId) {
    case "weapons": return [entry.type, entry.damage?.type, entry.properties];
    case "armors":
    case "shields": return [entry.properties];
    case "generalItems": return [entry.description, entry.amountCharges, entry.cost];
    case "equipmentProperties": return [entry.description];
    default: return Object.values(entry);
  }
}

export function searchCompendium(compendium, input) {
  const query = input.trim().toLowerCase();
  if (!query) return [];
  const results = [];

  function add(title, meta, target, terms = [], prefix = []) {
    const lowerTitle = title.toLowerCase();
    const index = searchText([...prefix, title, ...terms]).toLowerCase().indexOf(query);
    if (index < 0) return;
    const score = lowerTitle === query ? 0 : lowerTitle.startsWith(query) ? 1 : index + 2;
    results.push({ title, meta, target, score });
  }

  function addEntry(entry, view, target, meta, terms, prefix) {
    const key = view.fields?.find(field => field.isTitle)?.key;
    const title = String(entry[key] ?? entry.title ?? entry.name ?? entry.id);
    add(title, meta, { ...target, entryId: entry.id }, terms, prefix);
  }

  for (const tab of compendium.tabs) {
    const tabTarget = { tabId: tab.id };
    const isCustom = !originalTabs.has(tab.id);
    if (isCustom) {
      const type = tab.type.charAt(0).toUpperCase() + tab.type.slice(1);
      const target = tab.type === "normal" && tab.sections.length
        ? { ...tabTarget, sectionId: tab.sections[0].id } : tabTarget;
      add(tab.title, `${type} Tab`, target);
    }

    const groups = tab.classPageStructure?.groups ?? [];
    if (tab.type === "classes" && groups.length) {
      const members = new Map();
      for (const group of groups) {
        const groupLabel = tab.classPageLabels?.groupLabels?.[group.key] ?? group.key;
        for (const id of group.classes) {
          const title = tab.classPageLabels?.classLabels?.[id] ?? id;
          const target = { ...tabTarget, groupId: group.key, classId: id };
          add(title, "Class", target, [groupLabel, id, group.key]);
          members.set(id, { title, target });
        }
      }
      for (const ability of tab.entries) {
        const member = members.get(ability.class);
        if (member) {
          addEntry(ability, tab, member.target, `${member.title} Ability`,
            [member.title, ability.class, ability.description, ability.type]);
        }
      }
    } else {
      for (const entry of tab.entries) {
        const terms = tab.id === "conditions" ? [entry.description] : Object.values(entry);
        addEntry(entry, tab, tabTarget, tab.id === "conditions" ? "Condition" : tab.title, terms);
      }
    }

    for (const section of tab.sections) {
      const target = { ...tabTarget, sectionId: section.id };
      if (tab.id !== "equipment") {
        add(section.title, tab.id === "lore" ? "Lore Category" : tab.title, target,
          [], isCustom ? [tab.title] : []);
      }
      for (const entry of section.entries) {
        if (tab.id === "equipment") {
          addEntry(entry, section, target, section.title, [section.title, ...equipmentTerms(entry, section.id)]);
        } else if (tab.id === "lore") {
          addEntry(entry, section, target, section.title, [entry.content ?? entry.description]);
        } else {
          addEntry(entry, section, target, `${tab.title} / ${section.title}`,
            section.type === "normal" ? [entry.content ?? entry.description] : Object.values(entry),
            [tab.title, section.title]);
        }
      }
    }
  }

  return results.sort((a, b) => a.score - b.score || a.title.localeCompare(b.title)).slice(0, 12);
}

