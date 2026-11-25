import { mountCompendium } from "/src/browser/index.js";

async function request(path, body, { signal } = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error);
    error.status = response.status;
    throw error;
  }
  return result;
}

async function uploadImage(file) {
  const response = await fetch("/writer/image", {
    method: "POST",
    headers: { "Content-Type": file.type, "X-Compendium-Filename": encodeURIComponent(file.name) },
    body: file,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

const container = document.querySelector("#compendium-preview");
try {
  const response = await fetch("/compendium.json");
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  const writer = response.headers.get("x-compendium-writer") === "true" ? {
    uploadImage,
    saveEntry: changes => request("/writer/entry", changes),
    deleteAbility: reference => request("/writer/ability/delete", { reference }),
    changeNavigation: change => request("/writer/navigation", change),
    saveTypography: settings => request("/writer/typography", settings),
    checkSpelling: (text, options) => request("/writer/spellcheck", { text }, options),
  } : undefined;
  container.replaceChildren();
  mountCompendium(container, data, {
    title: "Compendium Preview",
    routing: true,
    imageBaseUrl: "/images/",
    projectId: response.headers.get("x-compendium-project") ?? data.id,
    writer,
    saveTarget: "the local compendium",
  });
} catch (error) {
  container.textContent = `Could not load the compendium. ${error.message}`;
  container.setAttribute("role", "alert");
}

