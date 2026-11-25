import { createDemoProject } from "../preview/demo-project.js";

const args = process.argv.slice(2);
try {
  if (args.length !== 1) throw new Error("Usage: npm run demo:new -- <project>");
  const { name } = await createDemoProject(args[0]);
  console.log(`Created demo/${name}/compendium.json. Run npm run start:writer -- ${name} to add content.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

