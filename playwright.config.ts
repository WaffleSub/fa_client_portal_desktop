import { defineConfig } from "@playwright/test";

/**
 * Playwright config for the Electron desktop wrap.
 *
 * Specs use `_electron.launch({ args: ["."] })` to boot the bundled
 * Electron entry. Make sure `npm run build:web && npm run build:electron`
 * has run at least once so `web/out/` + `dist/electron/` exist on disk.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false, // Electron app is a single process — don't race
  workers: 1,
  reporter: "line",
  timeout: 45_000,
  outputDir: "test-results",
  use: {
    trace: "retain-on-failure",
  },
});
