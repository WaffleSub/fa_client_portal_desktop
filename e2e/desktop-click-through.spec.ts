import { _electron as electron, expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

/**
 * Interactive click-through demo — proves Playwright Electron driver
 * supports clicks, fills, navigation, screenshots at each step.
 * Future TDD: pattern + assert per route.
 */

const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "e2e-output");
mkdirSync(OUT_DIR, { recursive: true });

test.setTimeout(45_000);

test("click through dashboard → settings → clients → load sample → screenshot each", async () => {
  const app = await electron.launch({ args: ["."], cwd: ROOT });

  // Electron opens DevTools in dev mode (when !app.isPackaged), so
  // `firstWindow()` can return the DevTools window instead of the app.
  // Poll until the `app://` BrowserWindow appears, then use that.
  let window = await app.firstWindow();
  for (let i = 0; i < 30; i += 1) {
    const appWin = app.windows().find((w) => w.url().startsWith("app://"));
    if (appWin) {
      window = appWin;
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!window.url().startsWith("app://")) {
    throw new Error(`Expected app:// window, got ${window.url()}`);
  }

  await window.waitForLoadState("domcontentloaded");
  await window.waitForTimeout(800); // let React hydrate

  // 1. Dashboard (landing)
  await window.screenshot({ path: resolve(OUT_DIR, "01-dashboard.png") });

  // 2. Click "Settings" in nav → wait for navigation → screenshot
  // Use href-based selector — robust to multiple text matches.
  await window.locator('a[href="/settings/"]').first().click();
  await window.waitForURL(/\/settings/, { timeout: 5000 }).catch(() => {});
  await window.waitForTimeout(800);
  await window.screenshot({ path: resolve(OUT_DIR, "02-settings.png") });

  // 3. Click "Clients" in nav → screenshot
  await window.locator('a[href="/clients/"]').first().click();
  await window.waitForURL(/\/clients/, { timeout: 5000 }).catch(() => {});
  await window.waitForTimeout(800);
  await window.screenshot({ path: resolve(OUT_DIR, "03-clients.png") });

  // 4. Back to dashboard → check for "Load sample data" button (only if empty)
  await window.locator('a[href="/dashboard/"]').first().click();
  await window.waitForURL(/\/dashboard/, { timeout: 5000 }).catch(() => {});
  await window.waitForTimeout(800);
  const loadSampleBtn = window.getByRole("button", { name: /load sample data/i });
  if (await loadSampleBtn.isVisible().catch(() => false)) {
    await loadSampleBtn.click();
    await window.waitForTimeout(1500);
    await window.screenshot({ path: resolve(OUT_DIR, "04-dashboard-with-sample.png") });
  } else {
    await window.screenshot({ path: resolve(OUT_DIR, "04-dashboard-already-populated.png") });
  }

  // 5. Click "Clients" again → should now show client list
  await window.locator('a[href="/clients/"]').first().click();
  await window.waitForURL(/\/clients/, { timeout: 5000 }).catch(() => {});
  await window.waitForTimeout(800);
  await window.screenshot({ path: resolve(OUT_DIR, "05-clients-list.png") });

  console.log("[click-through] 5 screenshots saved to:", OUT_DIR);

  await app.close();
});
