export const markup = `
<main>
    <header>
      <h1></h1>
      <div class="compendium-search">
        <label for="search">Search
          <input id="search" type="search" placeholder="Search the compendium" aria-controls="search-results" disabled>
        </label>
        <div id="search-results" role="region" aria-label="Search results" hidden></div>
      </div>
    </header>
    <div id="tab-navigation">
      <nav id="tabs" aria-label="Compendium sections"></nav>
      <div id="tab-writer-actions"></div>
    </div>
    <div id="subtabs"></div>
    <div id="content" aria-live="polite">Loading compendium…</div>
    <p id="writer-announcement" role="status"></p>
  </main>
  <dialog id="writer-dialog" aria-labelledby="writer-title">
    <form id="writer-form">
      <h2 id="writer-title">Edit entry</h2>
      <p id="writer-notice"></p>
      <div id="writer-fields"></div>
      <p id="writer-status" role="alert"></p>
      <div class="entry-actions">
        <button type="button">Cancel</button>
        <button type="submit">Save</button>
        <button id="writer-delete" type="button" hidden>Delete</button>
      </div>
    </form>
  </dialog>
  <dialog id="navigation-dialog" aria-labelledby="navigation-title">
    <form id="navigation-form" class="navigation-form">
      <h2 id="navigation-title"></h2>
      <label><span id="navigation-name-label">Name</span>
        <input id="navigation-name" required maxlength="120">
      </label>
      <label>Page type <select id="navigation-type"></select></label>
      <div class="navigation-colors">
        <label>Color <input id="navigation-color" type="color"></label>
        <label>Use default color <input id="navigation-default-color" type="checkbox"></label>
      </div>
      <p id="navigation-status" role="alert"></p>
      <div class="entry-actions">
        <button id="navigation-cancel" type="button">Cancel</button>
        <button id="navigation-save" type="submit">Save</button>
      </div>
    </form>
  </dialog>
  <dialog id="style-guide" aria-labelledby="style-guide-title">
    <form id="style-guide-form">
      <h2 id="style-guide-title">Style Guide</h2>
      <div class="style-guide-row style-guide-labels" aria-hidden="true">
        <span>Preview</span><span>Font</span><span>Size (px)</span><span>Color</span>
      </div>
      <div id="style-guide-fields"></div>
      <p id="style-guide-status" role="alert"></p>
      <div class="entry-actions">
        <button id="style-guide-cancel" type="button">Cancel</button>
        <button id="style-guide-save" type="submit">Save</button>
      </div>
    </form>
  </dialog>

`;
