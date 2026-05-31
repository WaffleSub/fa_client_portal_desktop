import { _electron as electron, expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

/**
 * Desktop smoke spec — launches the packaged Electron entry point,
 * waits for the renderer to finish loading the bundled Next.js static
 * export, screenshots the main window for vision QA.
 *
 * This is the minimum "does it work" test. Extend per route as we add
 * desktop-specific UI behaviour to verify.
 */

const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "e2e-output");
mkdirSync(OUT_DIR, { recursive: true });

test.setTimeout(30_000);

test("Electron launches, renders bundled web app, no MILLIONS gate prompt", async () => {
  const app = await electron.launch({
    args: ["."],
    cwd: ROOT,
  });

  const window = await app.firstWindow();
  // Wait for the SPA bundle to hydrate + the first paint to land
  await window.waitForLoadState("domcontentloaded");
  await window.waitForLoadState("networkidle").catch(() => {
    // app:// protocol doesn't emit network-idle the same way HTTP does;
    // domcontentloaded is sufficient for this smoke test
  });

  const title = await window.title();
  expect(title).toMatch(/ACE Wealth|Client Portal/i);

  // Screenshot the main window for visual verification
  const screenshotPath = resolve(OUT_DIR, "desktop-launch.png");
  await window.screenshot({ path: screenshotPath });
  console.log(`[smoke] screenshot saved: ${screenshotPath}`);

  // Verify the MILLIONS gate is NOT visible (desktop should bypass)
  // PreAccessGate renders a "Enter access password" heading when active;
  // assert that text is absent.
  const bodyText = await window.locator("body").innerText();
  expect(bodyText).not.toContain("Enter access password");

  await app.close();
});
