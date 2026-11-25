import { mkdir, writeFile } from "node:fs/promises";

const projectName = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

export function resolveDemoProject(name, root = new URL("../demo/", import.meta.url)) {
  if (typeof name !== "string" || name.length > 80 || !projectName.test(name) || reserved.test(name)) {
    throw new Error("Use a project name with up to 80 lowercase letters, digits, hyphens, or underscores.");
  }

  const directory = new URL(`${name}/`, root);
  return { name, directory, file: new URL("compendium.json", directory) };
}

export async function createDemoProject(name, root) {
  const project = resolveDemoProject(name, root);
  await mkdir(project.directory, { recursive: true });
  const data = { id: name, tabs: [], collections: [] };
  try {
    await writeFile(project.file, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`demo/${name}/compendium.json already exists.`);
    throw error;
  }
  return project;
}

