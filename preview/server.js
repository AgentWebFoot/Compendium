import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { createCompendiumStore } from "./data.js";
import { resolveDemoProject } from "./demo-project.js";
import { readImage, saveImage } from "./images.js";

const args = process.argv.slice(2);
const writer = args.includes("--writer");
const names = args.filter(arg => arg !== "--writer");
const [name] = names;
let project;
try {
  if (names.length !== 1) {
    const command = writer ? "npm run start:writer" : "npm start";
    throw new Error(`Specify one demo project: ${command} -- <project>.`);
  }
  project = resolveDemoProject(name);
  if (!(await stat(project.file)).isFile()) throw new Error(`demo/${name}/compendium.json is not a file.`);
} catch (error) {
  console.error(error.code === "ENOENT"
    ? `Missing demo/${name}/compendium.json. Create it with npm run demo:new -- ${name}.`
    : error.message);
  process.exit(1);
}
const store = createCompendiumStore(project.file);
const imagesDirectory = new URL("images/", project.directory);
let spellcheck;
const routes = new Map([
  ["/", ["index.html", "text/html"]],
  ["/app.js", ["app.js", "text/javascript"]],
  ["/src/typography.js", ["../src/typography.js", "text/javascript"]],
  ["/src/images.js", ["../src/images.js", "text/javascript"]],
  ["/src/index.js", ["../src/index.js", "text/javascript"]],
  ["/src/navigation.js", ["../src/navigation.js", "text/javascript"]],
  ["/src/browser/styles.css", ["../src/browser/styles.css", "text/css"]],
  ["/compendium.json", [project.file, "application/json"]],
]);

for (const file of ["index", "favorites", "search", "markup", "references", "inline-format", "style-guide", "writer", "navigation", "writer-spellcheck"]) {
  routes.set(`/src/browser/${file}.js`, [`../src/browser/${file}.js`, "text/javascript"]);
}

function json(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  }).end(JSON.stringify(payload));
}

function fromLocalPreview(request) {
  const port = server.address().port;
  return [`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(request.headers.origin);
}

async function handleUpload(request, response) {
  if (!writer) return json(response, 403, { error: "Start the preview in writer mode to upload images." });
  if (!fromLocalPreview(request)) return json(response, 403, { error: "Upload images from the local preview." });
  try {
    const { status, ...result } = await saveImage(imagesDirectory, request);
    return json(response, status, result);
  } catch (error) {
    console.error(error.message);
    return json(response, 500, { error: "Unable to save the image." });
  }
}

async function serveImage(request, response, name) {
  try {
    const image = await readImage(imagesDirectory, name);
    if (!image) {
      response.writeHead(404).end("Image not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": image.type,
      "Content-Length": image.bytes.length,
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : image.bytes);
  } catch (error) {
    console.error(error.message);
    response.writeHead(500).end("Unable to load the image");
  }
}


async function handleSave(request, response, path) {
  if (!writer) return json(response, 403, { error: "Start the preview in writer mode to save edits." });
  if (!fromLocalPreview(request) || request.headers["content-type"] !== "application/json") {
    return json(response, 403, { error: "Save edits from the local preview." });
  }

  try {
    request.setEncoding("utf8");
    let body = "";
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      body += chunk;
      if (body.length > 1_000_000) {
        request.resume();
        return json(response, 413, { error: "This edit is too large." });
      }
    }
    const payload = JSON.parse(body);
    if (path === "/writer/spellcheck") {
      spellcheck ??= import("./spellcheck.js").then(module => module.createPreviewSpellcheck(store));
      return json(response, 200, { issues: await (await spellcheck)(payload?.text) });
    }
    if (path === "/writer/typography") {
      return json(response, 200, await store.saveCompendiumTypography(payload));
    }
    if (path === "/writer/navigation") {
      return json(response, 200, await store.saveCompendiumNavigation(payload));
    }
    const { reference, values } = payload ?? {};
    if (!reference || typeof reference.tabId !== "string" || typeof reference.entryId !== "string") {
      return json(response, 400, { error: "Choose an entry." });
    }
    if (path === "/writer/ability/delete") {
      const updated = await store.deleteCompendiumAbility(reference);
      if (!updated) return json(response, 404, { error: "This ability could not be found." });
      return json(response, 200, updated);
    }
    if (!values || typeof values !== "object" || Array.isArray(values)) {
      return json(response, 400, { error: "Provide the entry edits." });
    }
    const entry = await store.saveCompendiumEntry(reference, values);
    if (!entry) return json(response, 404, { error: "This entry could not be found." });
    return json(response, 200, entry);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) {
      return json(response, 400, { error: error.message });
    }
    console.error(error.message);
    return json(response, 500, { error: "Unable to save the local compendium." });
  }
}

const server = createServer(async (request, response) => {
  const path = request.url.split("?")[0];
  if (path === "/writer/image" && request.method === "POST") {
    await handleUpload(request, response);
    return;
  }
  if (["/writer/entry", "/writer/navigation", "/writer/typography", "/writer/ability/delete", "/writer/spellcheck"].includes(path) && request.method === "POST") {
    await handleSave(request, response, path);
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }

  if (path.startsWith("/images/")) {
    await serveImage(request, response, path.slice("/images/".length));
    return;
  }

  const route = routes.get(path);
  if (!route) {
    response.writeHead(404).end("Not found");
    return;
  }

  const [file, type] = route;
  try {
    const writerEnabled = path === "/compendium.json" && writer;
    const content = await readFile(new URL(file, import.meta.url));
    response.writeHead(200, {
      "Content-Type": `${type}; charset=utf-8`,
      "Cache-Control": "no-store",
      "X-Compendium-Writer": String(writerEnabled),
      "X-Compendium-Project": project.name,
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    console.error(error.message);
    response.writeHead(500).end(`Unable to load ${file}. Check that it exists and contains valid data.`);
  }
});

server.on("error", error => {
  console.error(`Unable to start the preview: ${error.message}`);
  process.exitCode = 1;
});

server.listen(process.env.PORT ?? 4173, "127.0.0.1", () => {
  console.log(`Compendium ${writer ? "writer " : ""}preview: http://127.0.0.1:${server.address().port}/ (${project.name})`);
});

