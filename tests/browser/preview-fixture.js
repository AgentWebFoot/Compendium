import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "@playwright/test";
import { createDemoProject } from "../../preview/demo-project.js";

export const previewTest = test.extend({
  writerMode: [false, { option: true, scope: "worker" }],
  demoConfiguration: [undefined, { option: true, scope: "worker" }],
  previewUrl: [async ({ writerMode, demoConfiguration }, use) => {
    const directory = await mkdtemp(path.join(tmpdir(), "compendium-browser-"));
    let server;
    try {
      await Promise.all([
        cp(new URL("../../preview/", import.meta.url), path.join(directory, "preview"), { recursive: true }),
        cp(new URL("../../src/", import.meta.url), path.join(directory, "src"), { recursive: true }),
        writeFile(path.join(directory, "package.json"), JSON.stringify({ type: "module" })),
      ]);

      const project = await createDemoProject("browser-test", pathToFileURL(path.join(directory, "demo") + path.sep));
      if (demoConfiguration) await writeFile(project.file, JSON.stringify(demoConfiguration));
      const entry = path.join(directory, "preview", "server.js");
      server = spawn(process.execPath, [entry, "browser-test", ...(writerMode ? ["--writer"] : [])], { env: { ...process.env, PORT: "0" } });
      const output = await Promise.race([
        once(server.stdout, "data").then(([chunk]) => String(chunk)),
        once(server, "exit").then(([code]) => { throw new Error(`Preview exited with code ${code}.`); }),
      ]);
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
      if (!url) throw new Error(`Preview did not announce an address: ${output}`);
      await use(url);
    } finally {
      if (server?.pid && server.exitCode === null && server.signalCode === null) {
        const exited = once(server, "exit");
        server.kill();
        await exited;
      }
      await rm(directory, { recursive: true, force: true });
    }
  }, { scope: "worker" }],
});

