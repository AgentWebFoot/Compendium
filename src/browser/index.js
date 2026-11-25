import { createCompendium } from "../index.js";
import { favoriteKey, loadFavorites } from "./favorites.js";
import { createEntryEditor } from "./writer.js";
import { createNavigationEditor } from "./navigation.js";
import { searchCompendium } from "./search.js";
import { markup } from "./markup.js";
import { isImageName } from "../images.js";
import { createPageReferences } from "./references.js";
import { appendInline } from "./inline-format.js";
import { normalizeTypography } from "../typography.js";
import { applyHeadingStyle, createStyleGuide } from "./style-guide.js";

export function mountCompendium(container, configuration, {
  title = "Compendium",
  projectId = configuration.id ?? "local",
  routing = false,
  stylesheets = [],
  imageBaseUrl,
  writer = {},
  saveTarget = "this compendium",
} = {}) {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = markup;
  const titleHeading = root.querySelector("h1");
  titleHeading.textContent = title;
  let typography = normalizeTypography(configuration.typography);
  applyHeadingStyle(titleHeading, typography.title);
  root.querySelector("#writer-notice").textContent = `Changes are saved to ${saveTarget}.`;

  for (const href of [new URL("./styles.css", import.meta.url), ...stylesheets]) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    root.insertBefore(link, root.querySelector("main"));
  }
  container.append(host);


  const tabs = root.querySelector("#tabs");
  const subtabs = root.querySelector("#subtabs");
  const content = root.querySelector("#content");
  const search = root.querySelector("#search");
  const searchResults = root.querySelector("#search-results");
  const tabWriterActions = root.querySelector("#tab-writer-actions");

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function styledHeading(tag, text, role) {
    return applyHeadingStyle(element(tag, text), typography[role]);
  }

  function titleFor(key) {
    const words = key.replace(/([a-z])([A-Z])/g, "$1 $2");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  function display(value) {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.map(display).join(", ");
    if (typeof value === "object") return Object.values(value).map(display).join(" ");
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  }

  function columnsFor(page, entries) {
    if (page.columns?.length) return page.columns;
    const keys = new Set(entries.flatMap(entry => Object.keys(entry)));
    keys.delete("id");
    return [...keys].map(key => ({ key, label: titleFor(key) }));
  }

  function renderTable(page, entries, favorite, origin) {
    const wrapper = element("div");
    wrapper.className = "table-container";
    const table = element("table");
    table.setAttribute("aria-label", page.title);
    const header = table.createTHead().insertRow();
    const columns = columnsFor(page, entries);
    for (const { key, label } of columns) {
      const cell = element("th", label ?? titleFor(key));
      cell.scope = "col";
      header.append(cell);
    }
    const favoritesColumn = element("th", "Favorite");
    favoritesColumn.scope = "col";
    header.append(favoritesColumn);
    const body = table.createTBody();
    for (const entry of entries) {
      const row = body.insertRow();
      for (const { key } of columns) renderInline(row.insertCell(), display(entry[key]), origin);
      row.insertCell().append(favorite(entry));
    }
    wrapper.append(table);
    return wrapper;
  }

  const imageBase = imageBaseUrl ? new URL(imageBaseUrl, document.baseURI) : null;
  if (imageBase) imageBase.pathname = imageBase.pathname.replace(/\/?$/, "/");
  let findReference;
  let followReference;

  function renderInline(node, text, origin) {
    return appendInline(node, text, name => {
      const reference = findReference?.(name, origin);
      if (!reference) return null;
      const link = element(routing ? "a" : "button", name.trim());
      link.className = "inline-reference";
      if (routing) link.href = pageUrl(reference.location).href;
      else link.type = "button";
      link.addEventListener("click", event => {
        if (routing && (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)) return;
        event.preventDefault();
        followReference(reference.target);
      });
      return link;
    });
  }

  function renderImage(line, origin) {
    const match = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (!match || !imageBase || !isImageName(match[2])) return null;
    const [, caption, name] = match;
    const figure = element("figure");
    figure.className = "compendium-image";
    const image = element("img");
    image.src = new URL(encodeURIComponent(name), imageBase).href;
    image.alt = caption;
    image.loading = "lazy";
    figure.append(image);
    if (caption) figure.append(renderInline(element("figcaption"), caption, origin));
    return figure;
  }


  function renderProse(source, parentHeading, origin, favoriteBlock) {
    const body = element("div");
    body.className = "prose";
    let paragraph = [];
    let tableRows = [];
    let blockIndex = 0;

    function addBlock(node, excerpt = node.textContent) {
      if (!favoriteBlock) {
        body.append(node);
        return;
      }
      const block = element("div");
      block.className = "favorite-block";
      block.append(node, favoriteBlock(blockIndex++, excerpt.trim().slice(0, 300)));
      body.append(block);
    }

    function flushParagraph() {
      if (!paragraph.length) return;
      addBlock(renderInline(element("p"), paragraph.join("\n"), origin));
      paragraph = [];
    }

    function flushTable() {
      if (!tableRows.length) return;
      const wrapper = element("div");
      wrapper.className = "table-container";
      const table = element("table");
      const [columns, ...rows] = tableRows;
      const header = table.createTHead().insertRow();
      for (const label of columns) {
        const cell = renderInline(element("th"), label, origin);
        cell.scope = "col";
        header.append(cell);
      }
      const body = table.createTBody();
      for (const values of rows) {
        if (values.every(value => /^:?-{3,}:?$/.test(value))) continue;
        const row = body.insertRow();
        for (const value of values) renderInline(row.insertCell(), value, origin);
      }
      wrapper.append(table);
      addBlock(wrapper, tableRows.map(values => values.join(" | ")).join("\n"));
      tableRows = [];
    }

    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim();
      const cells = trimmed.startsWith("|")
        ? trimmed.slice(1).replace(/\|$/, "").split("|").map(cell => cell.trim()) : [];
      if (cells.length > 1) {
        flushParagraph();
        tableRows.push(cells);
        continue;
      }
      flushTable();
      const figure = renderImage(trimmed, origin);
      if (figure) {
        flushParagraph();
        addBlock(figure, trimmed);
        continue;
      }
      const title = trimmed.match(/^(#{1,3})[ \t]+(.+)$/);
      if (title) {
        flushParagraph();
        const level = title[1].length;
        const heading = renderInline(styledHeading(`h${Math.min(6, Number(parentHeading.slice(1)) + level)}`, "", `heading${level}`), title[2], origin);
        heading.className = `prose-title prose-title-${level}`;
        addBlock(heading);
      } else if (trimmed) {
        paragraph.push(line);
      } else {
        flushParagraph();
      }
    }
    flushParagraph();
    flushTable();
    return body;
  }


  function entryTitle(page, entry) {
    const titleField = page.fields?.find(field => field.isTitle)?.key;
    return display(entry[titleField] ?? entry.title ?? entry.name ?? entry.id);
  }

  function renderCard(page, entry, headingLevel, favorite, origin, rankedAbility = false) {
    const card = element("article");
    const titleField = page.fields?.find(field => field.isTitle)?.key;
    const header = element("div");
    header.className = "favorite-block";
    header.append(styledHeading(headingLevel, entryTitle(page, entry), "entryTitle"), favorite(entry));
    card.append(header);
    if (rankedAbility) {
      const metadata = [
        entry.actionCost == null ? "" : `Action ${display(entry.actionCost)}`,
        entry.enduranceCost == null ? "" : `Endurance ${display(entry.enduranceCost)}`,
        display(entry.type),
      ].filter(Boolean);
      if (metadata.length) {
        const line = element("p", metadata.join(" | "));
        line.className = "ability-meta";
        card.append(line);
      }
    }
    const renderField = (value, field) => renderProse(value, headingLevel, origin, (index, excerpt) =>
      favorite(entry, { field, index, excerpt }));
    if (typeof entry.content === "string") {
      card.append(renderField(entry.content, "content"));
    } else if (typeof entry.description === "string" && entry.description) {
      card.append(renderProse(entry.description, headingLevel, origin));
    } else if (entry.content ?? entry.description) {
      const text = element("p", display(entry.content ?? entry.description));
      text.className = "prose";
      card.append(text);
    }

    const hiddenFields = new Set(["id", "name", "title", "content", "description", titleField]);
    if (rankedAbility) {
      for (const key of ["class", "rank", "actionCost", "enduranceCost", "type"]) hiddenFields.add(key);
    }
    if (page.type === "normal" && origin.sectionId !== undefined) hiddenFields.add("color");
    const fields = page.fields ?? Object.keys(entry).map(key => ({ key }));
    const details = element("dl");
    for (const { key, label, type } of fields) {
      if (hiddenFields.has(key) || entry[key] === undefined) continue;
      const value = element("dd");
      if (type === "paragraph" && typeof entry[key] === "string") {
        value.append(renderField(entry[key], key));
      } else {
        value.textContent = display(entry[key]);
      }
      details.append(element("dt", label ?? titleFor(key)), value);
    }
    if (details.childElementCount) card.append(details);
    return card;
  }

  function entryFavorite(page, favoriteButton, tabId, sectionId) {
    return (entry, block) => favoriteButton(
      { tabId, sectionId, entryId: entry.id, block },
      block ? (block.excerpt || entryTitle(page, entry)) : entryTitle(page, entry)
    );
  }

  function renderEntries(page, entries, headingLevel, favoriteButton, tabId, sectionId) {
    const favorite = entryFavorite(page, favoriteButton, tabId, sectionId);
    if (page.type === "table") return renderTable(page, entries, favorite, { tabId, sectionId });
    const list = element("div");
    list.className = page.type === "grid" || page.type === "classes" ? "cards grid" : "cards";
    for (const entry of entries) list.append(renderCard(page, entry, headingLevel, favorite, { tabId, sectionId }));
    return list;
  }

  function applyNavigationColor(button, color) {
    if (typeof color !== "string" || !/^#[\da-f]{6}$/i.test(color)) return;
    const [red, green, blue] = color.slice(1).match(/.{2}/g).map(hex => {
      const value = parseInt(hex, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    button.style.setProperty("--navigation-color", color);
    button.style.setProperty("--navigation-ink", luminance > 0.179 ? "#000" : "#fff");
    button.classList.add("custom-navigation-color");
  }


  function selectOption(label, options, selection, key, update, showEmpty) {
    const selected = options.find(option => option.id === selection[key]) ?? options[0];
    if (!options.length && !showEmpty) return undefined;

    const nav = element("nav");
    nav.className = "subtabs";
    nav.setAttribute("aria-label", label);
    let selectedButton;
    const controls = options.map(option => {
      const button = element("button", option.title);
      applyNavigationColor(button, option.color);
      button.type = "button";
      button.setAttribute("aria-pressed", String(option === selected));
      button.addEventListener("click", () => {
        selection[key] = option.id;
        update(label);
      });
      nav.append(button);
      if (option === selected) selectedButton = button;
      return { ...option, control: button };
    });
    return { selected, nav, selectedButton, options: controls };
  }

  function getSectionGroups(sections) {
    const groups = new Map();
    for (const section of sections) {
      const { id, title, color } = section.navigationGroup ?? section;
      if (!groups.has(id)) groups.set(id, { id, title, color, sections: [] });
      groups.get(id).sections.push(section);
    }
    return [...groups.values()];
  }

  function getClassGroups(page) {
    const labels = page.classPageLabels;
    return (page.classPageStructure?.groups ?? []).map(group => ({
      id: group.key,
      title: labels?.groupLabels?.[group.key] ?? group.key,
      color: page.classPageColors?.group?.[group.key],
      classes: group.classes.map(id => ({
        id, title: labels?.classLabels?.[id] ?? id, color: page.classPageColors?.class?.[id],
      })),
    }));
  }

  function renderAbilityRanks(page, abilities, headingLevel, favoriteButton) {
    const ranks = new Map();
    for (const ability of abilities) {
      const value = ability.rank;
      const number = typeof value === "number" || (typeof value === "string" && value.trim())
        ? Number(value) : NaN;
      const rank = Number.isFinite(number) ? number : Infinity;
      if (!ranks.has(rank)) ranks.set(rank, []);
      ranks.get(rank).push(ability);
    }

    const groups = document.createDocumentFragment();
    const abilityHeading = `h${Math.min(6, headingLevel + 1)}`;
    const favorite = entryFavorite(page, favoriteButton, page.id);
    for (const rank of [...ranks.keys()].sort((a, b) => a - b)) {
      const section = element("section");
      section.className = "ability-rank";
      const cards = element("div");
      cards.className = "cards";
      const entries = ranks.get(rank).sort((a, b) => entryTitle(page, a).localeCompare(entryTitle(page, b)));
      for (const entry of entries) cards.append(renderCard(page, entry, abilityHeading, favorite, { tabId: page.id }, true));
      section.append(styledHeading(`h${headingLevel}`, rank === Infinity ? "Unranked" : `Rank ${rank}`, "sectionHeading"), cards);
      groups.append(section);
    }
    return groups;
  }


  function renderFullCompendium(compendium, favoriteButton) {
    const root = element("div");
    root.className = "full-compendium";
    root.append(styledHeading("h2", "Full Compendium", "pageTitle"));


    function addEntries(parent, page, entries, level, tab, heading) {

      if (!entries.length) return;
      if (heading) parent.append(styledHeading(`h${level}`, heading, "sectionHeading"));
      const entryHeading = `h${heading ? level + 1 : level}`;
      parent.append(renderEntries(page, entries, entryHeading, favoriteButton, tab.id, page === tab ? undefined : page.id));
    }

    for (const tab of compendium.tabs) {
      const chapter = element("section");
      chapter.append(styledHeading("h3", tab.title, "pageTitle"));
      const groups = tab.type === "classes" ? getClassGroups(tab) : [];
      if (groups.length) {
        const abilitiesByClass = new Map();
        for (const entry of tab.entries) {
          if (!abilitiesByClass.has(entry.class)) abilitiesByClass.set(entry.class, []);
          abilitiesByClass.get(entry.class).push(entry);
        }
        const groupedClasses = new Set();
        for (const group of groups) {
          const section = element("section");
          section.append(styledHeading("h4", group.title, "sectionHeading"));
          for (const characterClass of group.classes) {
            groupedClasses.add(characterClass.id);
            const abilities = abilitiesByClass.get(characterClass.id) ?? [];
            if (!abilities.length) continue;
            const classSection = element("section");
            classSection.append(
              styledHeading("h5", characterClass.title, "entryTitle"),
              renderAbilityRanks(tab, abilities, 6, favoriteButton)
            );
            section.append(classSection);
          }
          if (section.childElementCount > 1) chapter.append(section);
        }
        const ungrouped = tab.entries.filter(entry => !groupedClasses.has(entry.class));
        addEntries(chapter, tab, ungrouped, 4, tab, "Other abilities");
      } else {
        addEntries(chapter, tab, tab.entries, 4, tab);
      }

      for (const group of getSectionGroups(tab.sections)) {
        const section = element("section");
        section.append(styledHeading("h4", group.title, "sectionHeading"));
        for (const view of group.sections) {
          const heading = view.navigationGroup ? view.title : undefined;
          addEntries(section, view, view.entries, 5, tab, heading);
        }
        if (section.childElementCount > 1) chapter.append(section);
      }

      if (chapter.childElementCount > 1) root.append(chapter);
    }

    if (root.childElementCount === 1) {
      root.append(element("p", "This compendium has no entries."));
    }
    subtabs.replaceChildren();
    content.replaceChildren(root);
  }


  function pageUrl(location) {
    const url = new URL(window.location.href);
    for (const key of ["view", "tab", "subtab", "entry"]) {
      if (location[key] === undefined) url.searchParams.delete(key);
      else url.searchParams.set(key, location[key]);
    }
    return url;
  }

  function writePageQuery(location, historyMode) {
    const url = pageUrl(location);
    if (url.href !== window.location.href) window.history[historyMode](null, "", url);
  }


  function renderPage(page, selection, favoriteButton, navigationEditor, onNavigate, focusRow) {
    const location = { tab: page.id };
    const root = element("div");
    root.append(styledHeading("h2", page.title, "pageTitle"));
    const menus = [];

    function choose(label, options, state, key, path, sidebar) {
      const choice = selectOption(label, options, state, key, onNavigate, Boolean(navigationEditor));
      if (!choice) return undefined;
      const list = element("div");
      if (sidebar) choice.nav.classList.add("entry-sidebar");
      list.append(choice.nav);
      if (navigationEditor) {
        if (!sidebar) list.classList.add("navigation-with-actions");
        const controls = element("div");
        navigationEditor.attach(choice.nav, path, controls, choice.options, choice.selected);
        list.append(controls);
      }
      if (sidebar) sidebar.append(list);
      menus.push({ ...choice, label, sidebar, list });
      return choice;
    }

    function readingPane(label, options, state, key, path) {
      const layout = element("div");
      layout.className = "reading-layout";
      const choice = choose(label, options, state, key, path, layout);
      if (!choice) return undefined;
      const body = element("div");
      body.className = "reading-body";
      layout.append(body);
      root.append(layout);
      if (!choice.selected) body.append(element("p", "No categories yet."));
      return { selected: choice.selected, body };
    }

    function addEntries(view, entries, isSection = false) {
      if (!entries.length) return;
      if (!isSection) {
        root.append(renderEntries(view, entries, "h3", favoriteButton, page.id));
        return;
      }
      const group = element("section");
      group.append(styledHeading("h3", view.title, "sectionHeading"), renderEntries(view, entries, "h4", favoriteButton, page.id, view.id));
      root.append(group);
    }

    if (page.type === "classes" && page.classPageStructure) {
      const groups = getClassGroups(page);
      const group = choose("Class groups", groups, selection, "classGroup", [page.id])?.selected;
      location.subtab = group?.id;
      const pane = group && readingPane("Classes", group.classes, selection.groups[group.id] ??= Object.create(null), "class", [page.id, group.id]);
      if (pane?.selected) {
        const characterClass = pane.selected;
        location.entry = characterClass.id;
        pane.body.append(styledHeading("h3", characterClass.title, "entryTitle"));
        const abilities = page.entries.filter(entry => entry.class === characterClass.id);
        if (abilities.length) pane.body.append(renderAbilityRanks(page, abilities, 4, favoriteButton));
        else pane.body.append(element("p", "No abilities listed for this class."));
      }
    } else {
      addEntries(page, page.entries);
      const group = choose(`${page.title} subtabs`, getSectionGroups(page.sections), selection, "subtab", [page.id])?.selected;
      location.subtab = group?.id;
      for (const section of group?.sections ?? []) {
        const state = selection.groups[section.id] ??= Object.create(null);
        if (section.type === "normal" && (section.entries.length || navigationEditor)) {
          const options = section.entries.map(entry => ({
            id: entry.id,
            title: entry.title ?? entry.name ?? entry.id,
            color: entry.color,
            entry,
          }));
          const pane = readingPane(`${section.title} entries`, options, state, "entry", [page.id, group.id]);
          if (pane?.selected) {
            location.entry ??= pane.selected.id;
            pane.body.append(renderEntries(section, [pane.selected.entry], "h3", favoriteButton, page.id, section.id));
          }
        } else {
          addEntries(section, section.entries, true);
        }
      }
    }

    if (root.childElementCount === 1) {
      root.append(element("p", "No entries in this section."));
    }
    subtabs.replaceChildren(...menus.filter(menu => !menu.sidebar).map(menu => menu.list));
    content.replaceChildren(root);
    menus.find(menu => menu.label === focusRow)?.selectedButton?.focus();
    return location;
  }

  function showCompendium(configuration, projectId) {
    const canWrite = Boolean(writer.saveEntry || writer.changeNavigation || writer.saveTypography);
    const entryEditor = writer.saveEntry ? createEntryEditor(root, writer, saveTarget) : null;
    function setLocation(location, historyMode) {
      if (routing && host.isConnected) writePageQuery(location, historyMode);
    }
    let compendium = createCompendium(configuration);
    findReference = createPageReferences(compendium);
    followReference = openTarget;
    let selected = compendium.tabs[0];

    const fullView = Symbol("Full Compendium");
    const fullTab = element("button", "Full Compendium");
    fullTab.type = "button";

    let writerTools = false;
    const navigationEditor = writer.changeNavigation
      ? createNavigationEditor(root, () => configuration, applyConfiguration, writer.changeNavigation, saveTarget) : null;
    if (canWrite) {
      const toolbar = element("div");
      toolbar.className = "writer-toolbar";
      const guideButton = writer.saveTypography ? element("button", "Style Guide") : null;
      if (guideButton) {
        const guide = createStyleGuide(root, writer.saveTypography, applyConfiguration);
        guideButton.type = "button";
        guideButton.hidden = true;
        guideButton.addEventListener("click", () => guide.show(typography));
        toolbar.append(guideButton);
      }
      const toggle = element("button", "Show Writer Tools");
      toggle.type = "button";
      toggle.setAttribute("aria-pressed", "false");
      toggle.addEventListener("click", () => {
        writerTools = !writerTools;
        if (guideButton) guideButton.hidden = !writerTools;
        toggle.textContent = writerTools ? "Hide Writer Tools" : "Show Writer Tools";
        toggle.setAttribute("aria-pressed", String(writerTools));
        renderTabButtons();
        renderTabWriterActions();
        renderSelected();
      });
      const main = root.querySelector("main");
      main.classList.add("writer-preview");
      toggle.className = "writer-toggle";
      toolbar.append(toggle);
      main.append(toolbar);
    }
    const favorites = loadFavorites(projectId);
    const favoritesTab = element("button");
    favoritesTab.type = "button";
    const updateFavoriteCount = () => {
      favoritesTab.textContent = `Favorites (${favorites.size})`;
    };
    updateFavoriteCount();

    const selections = new Map(compendium.tabs.map(page => [
      page.id, { groups: Object.create(null) },
    ]));
    const tabButtons = new Map();

    function favoriteButton(item, title) {
      const button = element("button", "☆");
      button.className = "favorite-star";
      button.type = "button";
      button.dataset.favoriteKey = favoriteKey(item);
      button.setAttribute("aria-label", `Favorite: ${title}`);
      const showState = pressed => {
        button.textContent = pressed ? "★" : "☆";
        button.setAttribute("aria-pressed", String(pressed));
      };
      showState(favorites.has(item));
      button.addEventListener("click", () => {
        showState(favorites.toggle(item));
        updateFavoriteCount();
      });
      if (!writerTools || !entryEditor || item.block) return button;
      const source = compendium.resolveEntry(item);
      const edit = element("button", "Edit");
      edit.type = "button";
      edit.setAttribute("aria-label", `Edit: ${title}`);
      const afterDelete = writer.deleteAbility && !source.section && source.tab.type === "classes" && typeof source.entry.class === "string"
        ? updated => {
          applyConfiguration(updated);
          const selectedClass = content.querySelector('.entry-sidebar [aria-pressed="true"]');
          (selectedClass ?? tabs.querySelector('[aria-pressed="true"]'))?.focus();
          root.querySelector("#writer-announcement").textContent = `Deleted ${title} from ${saveTarget}.`;
        } : undefined;
      function afterSave(updated) {
        Object.assign(source.entry, updated);
        findReference = createPageReferences(compendium);
        renderSelected();
        const updatedTitle = entryTitle(source.section ?? source.tab, source.entry);
        const buttons = content.querySelectorAll(".entry-actions");
        const actions = [...buttons].find(group => group.firstElementChild.dataset.favoriteKey === favoriteKey(item));
        actions?.lastElementChild.focus();
        root.querySelector("#writer-announcement").textContent = `Saved ${updatedTitle} to ${saveTarget}.`;
      }
      const paragraphFields = (source.section ?? source.tab).fields
        ?.filter(field => field.type === "paragraph").map(field => field.key);
      edit.addEventListener("click", () =>
        entryEditor.editEntry(item, title, source.entry, {
          afterSave, afterDelete, paragraphFields,
          hideNavigationColor: source.section?.type === "normal",
        }));
      const actions = element("div");
      actions.className = "entry-actions";
      actions.append(button, edit);
      return actions;
    }

    function renderSelected(focusRow, historyMode = "replaceState") {
      if (selected === fullView) {
        renderFullCompendium(compendium, favoriteButton);
        setLocation({ view: "full" }, historyMode);
      } else if (selected) {
        const location = renderPage(selected, selections.get(selected.id), favoriteButton,
          writerTools ? navigationEditor : null, row => renderSelected(row, "pushState"), focusRow);
        setLocation(location, historyMode);
      }
    }

    function activate(page, historyMode = "pushState") {
      selected = page;
      for (const [id, button] of tabButtons) {
        button.setAttribute("aria-pressed", String(id === page?.id));
      }
      favoritesTab.setAttribute("aria-pressed", String(!page));
      fullTab.setAttribute("aria-pressed", String(page === fullView));
      renderTabWriterActions();
      search.value = "";
      search.disabled = false;
      renderSearchResults();
      if (page) renderSelected(undefined, historyMode);
      else {
        renderFavorites();
        setLocation({ view: "favorites" }, historyMode);
      }
    }

    function openSource(item, { tab, section, entry }) {
      const selection = selections.get(tab.id);
      if (section) {
        selection.subtab = section.navigationGroup?.id ?? section.id;
        const state = selection.groups[section.id] ??= Object.create(null);
        state.entry = entry.id;
      } else if (tab.type === "classes" && selection.groups[selection.classGroup]?.class !== entry.class) {
        const group = tab.classPageStructure?.groups?.find(group => group.classes.includes(entry.class));
        if (group) {
          selection.classGroup = group.key;
          const state = selection.groups[group.key] ??= Object.create(null);
          state.class = entry.class;
        }
      }
      activate(tab);

      const buttons = [...content.querySelectorAll("[data-favorite-key]")];
      const target = buttons.find(button => button.dataset.favoriteKey === favoriteKey(item))
        ?? buttons.find(button => button.dataset.favoriteKey === favoriteKey({ ...item, block: undefined }));
      target?.focus();
    }

    function renderFavorites() {
      subtabs.replaceChildren();
      const root = element("div");
      root.append(styledHeading("h2", "Favorites", "pageTitle"));
      if (!favorites.size) {
        root.append(element("p", "Star an entry or a passage to save it here."));
        content.replaceChildren(root);
        return;
      }
      const list = element("div");
      list.className = "cards";
      for (const item of favorites.values()) {
        const source = compendium.resolveEntry(item);
        const card = element("article");
        const title = source ? entryTitle(source.section ?? source.tab, source.entry) : item.entryId;
        card.append(styledHeading("h3", title, "entryTitle"));
        if (source) {
          const location = [source.tab.title, source.section?.title].filter(Boolean).join(" / ");
          card.append(element("p", location));
          if (item.block?.excerpt) card.append(element("p", item.block.excerpt));
        } else {
          card.append(element("p", "This entry is no longer available."));
        }

        const actions = element("div");
        actions.className = "favorite-actions";
        if (source) {
          const open = element("button", "Open source");
          open.type = "button";
          open.addEventListener("click", () => openSource(item, source));
          actions.append(open);
        }
        const remove = element("button", "Remove");
        remove.type = "button";
        remove.setAttribute("aria-label", `Remove favorite: ${title}`);
        remove.addEventListener("click", () => {
          favorites.toggle(item);
          updateFavoriteCount();
          renderFavorites();
          favoritesTab.focus();
        });
        actions.append(remove);
        card.append(actions);
        list.append(card);
      }
      root.append(list);
      content.replaceChildren(root);
    }

    function renderSearchResults() {
      const results = searchCompendium(compendium, search.value);
      searchResults.replaceChildren();
      searchResults.hidden = !search.value.trim();
      if (searchResults.hidden) return;
      if (!results.length) {
        const empty = element("p", "No matches found.");
        empty.setAttribute("role", "status");
        searchResults.append(empty);
        return;
      }

      for (const result of results) {
        const button = element("button");
        button.type = "button";
        const title = element("span", result.title);
        title.className = "search-result-title";
        const location = element("small", result.meta);
        location.className = "search-result-location";
        button.append(title, location);
        button.addEventListener("click", () => openTarget(result.target));
        searchResults.append(button);
      }
    }

    function openTarget(target) {
      const tab = compendium.tabs.find(page => page.id === target.tabId);
      if (!tab) return;
      const selection = selections.get(tab.id);
      if (target.groupId !== undefined) {
        selection.classGroup = target.groupId;
        const state = selection.groups[target.groupId] ??= Object.create(null);
        state.class = target.classId;
      }
      if (target.entryId !== undefined) {
        const source = compendium.resolveEntry(target);
        if (source) {
          openSource(target, source);
          return;
        }
      }
      const section = tab.sections.find(view => view.id === target.sectionId);
      if (section) {
        selection.subtab = section.navigationGroup?.id ?? section.id;
        const state = selection.groups[section.id] ??= Object.create(null);
        delete state.entry;
      }
      activate(tab);
      tabButtons.get(tab.id)?.focus();
    }

    search.addEventListener("input", renderSearchResults);
    search.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        search.value = "";
        renderSearchResults();
      } else if (event.key === "Enter" || event.key === "ArrowDown") {
        const first = searchResults.querySelector("button");
        if (!first || searchResults.hidden) return;
        event.preventDefault();
        first.focus();
      }
    });
    searchResults.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        search.value = "";
        renderSearchResults();
        search.focus();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const next = event.key === "ArrowDown" ? event.target.nextElementSibling : event.target.previousElementSibling ?? search;
        next?.focus();
      }
    });

    favoritesTab.addEventListener("click", () => activate(null));
    fullTab.addEventListener("click", () => activate(fullView));
    function renderTabWriterActions() {
      tabs.parentElement.classList.toggle("navigation-with-actions", writerTools);
      if (!writerTools || !navigationEditor) {
        tabWriterActions.replaceChildren();
        delete tabs.dataset.navigationPath;
        return;
      }
      const options = compendium.tabs.map(page => ({ ...page, control: tabButtons.get(page.id) }));
      navigationEditor.attach(tabs, [], tabWriterActions, options, options.find(option => option.id === selected?.id));
    }

    function renderTabButtons() {
      tabs.replaceChildren(favoritesTab, fullTab);
      tabButtons.clear();
      for (const page of compendium.tabs) {
        const button = element("button", page.title);
        button.type = "button";
        applyNavigationColor(button, page.color);
        button.setAttribute("aria-pressed", String(page.id === selected?.id));
        button.addEventListener("click", () => activate(page));
        tabButtons.set(page.id, button);
        tabs.append(button);
        if (!selections.has(page.id)) selections.set(page.id, { groups: Object.create(null) });
      }
    }

    function applyConfiguration(updated, added) {
      if (!host.isConnected) return;
      const previous = selected;
      typography = normalizeTypography(updated.typography);
      applyHeadingStyle(titleHeading, typography.title);
      configuration = updated;
      compendium = createCompendium(configuration);
      findReference = createPageReferences(compendium);
      renderTabButtons();
      if (added) {
        const [tabId, subtabId] = added.path;
        const tab = compendium.tabs.find(page => page.id === (tabId ?? added.id));
        if (tab) {
          const state = selections.get(tab.id);
          if (tabId) {
            const isClasses = tab.type === "classes" && tab.classPageStructure;
            if (isClasses) state.classGroup = subtabId ?? added.id;
            else state.subtab = subtabId ?? added.id;
            if (subtabId) {
              const subtab = state.groups[subtabId] ??= Object.create(null);
              subtab[isClasses ? "class" : "entry"] = added.id;
            }
          }
          activate(tab);
          return;
        }
      }
      if (!previous || previous === fullView) {
        activate(previous, "replaceState");
        return;
      }
      activate(compendium.tabs.find(page => page.id === previous.id) ?? compendium.tabs[0] ?? fullView, "replaceState");
    }

    function restorePageFromUrl() {
      const params = new URL(window.location.href).searchParams;
      if (params.get("view") === "favorites") return activate(null, "replaceState");
      if (params.get("view") === "full") return activate(fullView, "replaceState");

      const tabId = params.get("tab");
      const tab = compendium.tabs.find(page => page.id === tabId) ?? compendium.tabs[0];
      if (!tab) return activate(fullView, "replaceState");

      const subtab = tab.id === tabId ? params.get("subtab") : null;
      const entry = tab.id === tabId ? params.get("entry") : null;
      const selection = selections.get(tab.id);
      if (tab.type === "classes" && tab.classPageStructure) {
        const groups = getClassGroups(tab);
        const group = groups.find(candidate => candidate.id === subtab) ?? groups[0];
        selection.classGroup = group?.id;
        if (group) {
          const state = selection.groups[group.id] ??= Object.create(null);
          state.class = group.id === subtab || !subtab ? entry : null;
        }
      } else {
        const groups = getSectionGroups(tab.sections);
        const group = groups.find(candidate => candidate.id === subtab) ?? groups[0];
        selection.subtab = group?.id;
        for (const section of group?.sections ?? []) {
          const state = selection.groups[section.id] ??= Object.create(null);
          state.entry = group.id === subtab || !subtab ? entry : null;
        }
      }
      activate(tab, "replaceState");
    }

    renderTabButtons();
    if (routing) {
      restorePageFromUrl();
      window.addEventListener("popstate", restorePageFromUrl);
    } else {
      activate(selected ?? fullView);
    }
    return () => {
      window.removeEventListener("popstate", restorePageFromUrl);
      entryEditor?.dispose();
    };
  }

  try {
    const dispose = showCompendium(structuredClone(configuration), projectId);
    return {
      destroy() {
        dispose();
        host.remove();
      },
    };
  } catch (error) {
    host.remove();
    throw error;
  }
}

