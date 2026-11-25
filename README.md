# Compendium

Compendium is the foundation for a reusable game reference. A project defines its tabs, the collections they display, and the fields to present. It can give each tab or subsection its own collection or point several views at the same collection.

The supported page types are `normal`, `grid`, `table`, and `classes`. A subsection can choose a different type from its parent. Display titles are independent of IDs, so a saved reference can keep working after a rename. Projects should keep IDs stable when editing content.

## Example

```js
import { createCompendium } from "./src/index.js";

const bestiary = createCompendium({
  tabs: [
    {
      id: "creatures",
      title: "Bestiary",
      type: "grid",
      collectionId: "creatures",
      fields: [{ key: "threat", label: "Threat", type: "number" }],
    },
  ],
  collections: [
    {
      id: "creatures",
      entries: [{ id: "hound", name: "War Hound", threat: 2 }],
    },
  ],
});

const favorite = { tabId: "creatures", entryId: "hound" };
const result = bestiary.resolveEntry(favorite);
console.log(result.entry.name); // War Hound
```

For an entry inside a subsection, include its `sectionId` in the reference. A reference to a missing entry resolves to `null`.

This initial module resolves config and data for future page renderers. Field metadata is available to those renderers. The page UI, project themes, storage integrations, and Travelers Tavern migration are follow-on work.

Run the tests with `npm test`.


## Embed the interface in another project

Import the browser interface from `compendium/browser` in an npm-based frontend. Mount it after the host element exists and after loading the project's shared JSON.

```html
<div id="game-compendium"></div>
```

```js
import { mountCompendium } from "compendium/browser";

const response = await fetch("/my-game/compendium.json");
if (!response.ok) throw new Error("Unable to load the compendium.");
const configuration = await response.json();

const compendium = mountCompendium(
  document.querySelector("#game-compendium"),
  configuration,
  {
    title: "My Game Compendium",
    projectId: "my-game",
    routing: true,
    stylesheets: ["/my-game/compendium-theme.css"],
    imageBaseUrl: "/my-game/compendium-images/",
  }
);

// Call compendium.destroy() when your project removes the view.
```

The package supplies navigation, search, Full Compendium, favorites, and the default stylesheet. The interface mounts inside a shadow root. Stylesheets supplied by the host load after the default stylesheet inside that root. Favorites use browser storage scoped to the project ID. URL routing is opt-in because it writes the `tab`, `subtab`, `entry`, and `view` query parameters. Enable it for one instance on a page.

To enable Writer Tools, pass a `writer` object with callbacks for the operations the host supports. The host decides who gets these callbacks and enforces permission checks on its server.

| Callback | Expected return value |
| --- | --- |
| `saveEntry({ reference, values })` | The updated entry. `reference` contains `tabId`, optional `sectionId`, and `entryId`. |
| `deleteAbility(reference)` | The complete updated shared configuration. Supply this alongside `saveEntry`. |
| `changeNavigation(change)` | The complete updated shared configuration. The change includes an `action`, a parent ID `path`, and fields for the action, such as `id`, `targetId`, `title`, or `color`. |
| `saveTypography(typography)` | The complete updated shared configuration with the project typography stored at `configuration.typography`. |
| `uploadImage(file, { reference })` | An object with a `name` such as `harbor-map.webp`. Serve the image at that filename under the configured `imageBaseUrl`. Supply this alongside `saveEntry`. |
| `checkSpelling(text, { signal })` | An object with an `issues` array. Each issue has `word`, `start`, `end`, and `suggestions`. |

A Node backend can use `changeNavigation(configuration, change)` from `compendium/navigation` to apply navigation changes and `createSpellchecker(configuration)` from `compendium/spellcheck` to produce spelling issues. The preview server is one example of connecting those functions to storage. The regular preview uses the same browser package as any other host.


## Local demo projects

Each demo has one file, `demo/<project>/compendium.json`. Run the commands from the Compendium repository:

```powershell
npm start -- my-game
npm run start:writer -- my-game
```

Open http://127.0.0.1:4173/. Both commands require the demo folder name. If the demo does not exist yet, create it using the command below. Stop the current preview with Ctrl+C before starting a different project or mode on the same port.

Both modes read the selected project's JSON. In writer mode, click **Show Writer Tools** to add tabs and edit content. Changes save to that project's file. Reload the read-only preview to see them. Search and browser favorites use the selected demo. Start that demo before opening a shared entry URL. Full Compendium lists entries in navigation order. Lore supports headings written with `#`, `##`, or `###` and blank lines between paragraphs.

### Start a new compendium

```powershell
npm run demo:new -- my-game
npm run start:writer -- my-game
```

The first command creates `demo/my-game/compendium.json` with an empty layout. It leaves existing files intact. Use lowercase letters, digits, hyphens, or underscores for the project folder name.

You can also create the file by hand. A zero-byte file is invalid JSON. This is a complete, empty compendium:

```json
{
  "id": "my-game",
  "tabs": [],
  "collections": []
}
```

To use it in another project, put the generated JSON where that project serves its data, then load it with `mountCompendium` as shown above.

### Writer controls

Use **Add**, **Edit**, or **Remove** to the right of tabs and subtabs or below the category list. **Edit** lets you change the name and color. Drag items within their list to reorder them, or focus an item and press Alt with an arrow key. The preview serves files on your computer's loopback address and has no account-based writer permissions.

### Style Guide

Turn on **Show Writer Tools**, then open **Style Guide**. Choose a font, size, and color for the compendium title, page titles, entry and class titles, section and rank headings, or each of the three text heading levels. Use **Reset** beside the size to restore its theme default without changing the font or color. The font and color have their own **Default** controls.

The preview saves overrides to the current project's JSON. An embedded compendium also reads these settings. For example, `"typography": { "heading1": { "font": "georgia", "size": 26 } }` sets the look of headings written with `#`. Hosts can enable the editor with `saveTypography` and validate settings on their server using `normalizeTypography` from `compendium/typography`.

### Format compendium text

In a text editor, select the words to format and click **Bold**, **Italic**, **Underline**, or **Strikethrough**. The editor stores these as `**bold**`, `*italic*`, `++underline++`, and `~~strikethrough~~`. Click the same control again with the text selected to remove its formatting. The reader displays the formatting when you save the entry.

### Links and images in compendium text

Put a visible tab, subtab, or entry name in angle brackets, such as `<The Harbor>`. Names are case-insensitive. When names repeat, the current subtab and tab take priority. Use `<World / Places / The Harbor>` to select a specific destination.

Use `![Caption](filename.webp)` on its own line to show a project image. In Writer Tools, **Upload image** adds this markup at the cursor. The local preview accepts PNG, JPEG, and WebP files up to 5 MB and stores them in `demo/<project>/images/`. Save the entry to keep the image reference. Host projects can enable the same feature with `imageBaseUrl` and the `uploadImage` callback.

### Spellcheck in Writer Tools

Run `npm ci` once to install the spellcheck dictionary, then start the writer preview. The editor checks prose as you type and recognizes words already in the compendium. Right-click an underlined word to choose a replacement. Suggestions update the editor until you save them to the JSON file.

The browser regression tests check that spellcheck underlines stay aligned with native textarea text after scrolling, reflow, and resizing. Install Chromium once with `npx playwright install chromium`, then run `npm run test:browser`. To use installed Chrome in PowerShell, run `$env:COMPENDIUM_BROWSER_CHANNEL = 'chrome'` before the test command.
