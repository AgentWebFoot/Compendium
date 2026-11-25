import assert from "node:assert/strict";
import { test } from "node:test";
import { createCompendium } from "../src/index.js";

test("Pyrrhic-style grids can use different fields and collections", () => {
  const buildings = { id: "buildings", entries: [{ id: "watchtower", name: "Watchtower", faction: "Neutral" }] };
  const creatures = { id: "creatures", entries: [{ id: "hound", name: "Hound", threat: 2 }] };
  const compendium = createCompendium({
    tabs: [
      { id: "buildings", title: "Buildings/POI", type: "grid", collectionId: "buildings", fields: [{ key: "faction", type: "text" }] },
      { id: "creatures", title: "Creatures", type: "grid", collectionId: "creatures", fields: [{ key: "threat", type: "number" }] },
    ],
    collections: [buildings, creatures],
  });

  assert.deepEqual(compendium.tabs.map(tab => tab.fields[0].key), ["faction", "threat"]);
  assert.deepEqual(compendium.tabs.map(tab => tab.entries), [buildings.entries, creatures.entries]);
});

test("Condition grids can have independent entries or share a collection explicitly", () => {
  const tabs = [
    { id: "conditions", title: "Conditions", type: "grid", collectionId: "conditions" },
    { id: "ship-conditions", title: "Ship Conditions", type: "grid", collectionId: "ship-conditions" },
    { id: "quick-reference", title: "Quick Reference", type: "table", collectionId: "conditions" },
  ];
  const collections = [
    { id: "conditions", entries: [{ id: "prone", name: "Prone" }] },
    { id: "ship-conditions", entries: [{ id: "adrift", name: "Adrift" }] },
  ];
  const compendium = createCompendium({ tabs, collections });

  assert.deepEqual(compendium.tabs.map(tab => tab.entries.map(entry => entry.id)), [
    ["prone"], ["adrift"], ["prone"],
  ]);
  assert.equal(compendium.resolveEntry({ tabId: "ship-conditions", entryId: "prone" }), null);
});

test("a favorite still resolves after tabs reorder and tab, section, and entry labels change", () => {
  const favorite = { tabId: "creatures", sectionId: "beasts", entryId: "hound" };
  const tabs = [
    {
      id: "creatures", title: "Creatures", type: "normal",
      sections: [{ id: "beasts", title: "Beasts", type: "grid", collectionId: "creatures" }],
    },
    { id: "classes", title: "Classes", type: "classes" },
  ];
  const collections = [{ id: "creatures", entries: [{ id: "hound", name: "Hound" }] }];
  assert.equal(createCompendium({ tabs, collections }).resolveEntry(favorite).entry.name, "Hound");

  const [creatures, classes] = tabs;
  const compendium = createCompendium({
    tabs: [classes, { ...creatures, title: "Bestiary", sections: [{ ...creatures.sections[0], title: "Animals" }] }],
    collections: [{ id: "creatures", entries: [{ id: "hound", name: "War Hound" }] }],
  });
  const result = compendium.resolveEntry(favorite);

  assert.equal(result.tab.title, "Bestiary");
  assert.equal(result.section.title, "Animals");
  assert.equal(result.section.type, "grid");
  assert.equal(result.entry.name, "War Hound");
});

test("invalid types, duplicate IDs, and missing collections fail during configuration", () => {
  assert.throws(() => createCompendium({ tabs: [{ id: "invalid", type: "lore" }] }), /Unknown page type/);
  assert.throws(() => createCompendium({ tabs: [{ id: "same" }, { id: "same" }] }), /Duplicate tab ID/);
  assert.throws(() => createCompendium({ tabs: [{ id: "missing", collectionId: "unknown" }] }), /Unknown collection/);
});

