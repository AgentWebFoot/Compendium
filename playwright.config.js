import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  use: {
    browserName: "chromium",
    channel: process.env.COMPENDIUM_BROWSER_CHANNEL,
    launchOptions: { chromiumSandbox: process.platform === "win32" },
  },
});

