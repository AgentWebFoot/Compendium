import assert from "node:assert/strict";
import { test } from "node:test";
import { changeNavigation, getNavigation } from "../src/navigation.js";
import { createCompendium } from "../src/index.js";

test("navigation edits preserve IDs and isolate shared collections", () => {
  const data = {
    tabs: [
      { id: "lore", title: "Lore", sections: [{ id: "rules", title: "Rules", collectionId: "shared" }] },
      { id: "other", title: "Other", collectionId: "shared" },
    ],
    collections: [{ id: "shared", entries: [{ id: "one", title: "First" }, { id: "two", title: "Second" }] }],
  };
  changeNavigation(data, { path: ["lore", "rules"], action: "rename", id: "two", title: "Edited", color: "#2468ad" });
  changeNavigation(data, { path: ["lore", "rules"], action: "move", id: "two", targetId: "one" });

  const view = createCompendium(data);
  assert.deepEqual(view.tabs[0].sections[0].entries.map(entry => entry.id), ["two", "one"]);
  assert.equal(view.resolveEntry({ tabId: "lore", sectionId: "rules", entryId: "two" }).entry.title, "Edited");
  assert.deepEqual(view.tabs[1].entries.map(entry => entry.title), ["First", "Second"]);
  assert.equal(getNavigation(data).items[0].children.items[0].children.items[0].color, "#2468ad");
});

test("grouped equipment sections move and rename together", () => {
  const data = {
    tabs: [{ id: "gear", title: "Equipment", type: "table", sections: [
      { id: "weapons", title: "Weapons" },
      { id: "armors", title: "Armor", navigationGroup: { id: "protection", title: "Protection" } },
      { id: "shields", title: "Shields", navigationGroup: { id: "protection", title: "Protection" } },
    ] }],
  };
  changeNavigation(data, { path: ["gear"], action: "rename", id: "protection", title: "Defense", color: "#112233" });
  changeNavigation(data, { path: ["gear"], action: "move", id: "protection", direction: -1 });

  assert.deepEqual(data.tabs[0].sections.map(section => section.id), ["armors", "shields", "weapons"]);
  assert.deepEqual(data.tabs[0].sections.slice(0, 2).map(section => section.navigationGroup.title), ["Defense", "Defense"]);
});

test("removing a class removes its abilities from that tab's collection", () => {
  const data = {
    tabs: [{ id: "classes", title: "Classes", type: "classes", collectionId: "abilities",
      classPageStructure: { groups: [{ key: "fighters", classes: ["fighter", "scout"] }] },
    }],
    collections: [{ id: "abilities", entries: [{ id: "hit", class: "fighter" }, { id: "hide", class: "scout" }] }],
  };
  changeNavigation(data, { path: ["classes", "fighters"], action: "remove", id: "scout" });
  assert.deepEqual(createCompendium(data).tabs[0].entries.map(entry => entry.id), ["hit"]);
});

