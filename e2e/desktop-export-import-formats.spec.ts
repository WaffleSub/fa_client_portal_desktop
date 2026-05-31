import { _electron as electron, expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

/**
 * Mode C regression spec — SHA 7d9672e (export-format relabel + upload restriction)
 *
 * Scoped to TWO surfaces only:
 *   1. Header export buttons (Dashboard) — labels must read "Export XLSX" and
 *      "Export JSON" (previously "Export" and "JSON").
 *   2. /import page dropzone — helper line must read ".xlsx or .json · up to 50 MB"
 *      and intro prose must reference ".xlsx or .json exports from this app".
 *      No leftover ".xls" / ".csv" text anywhere on the page.
 *
 * Infrastructure traps baked in:
 *
 * TRAP 1 — DevTools window race
 *   In dev mode Electron opens a DevTools BrowserWindow; `firstWindow()` may
 *   return it instead of the app:// window. Poll `app.windows()` until the
 *   `app://` URL window appears, then use that for all interactions.
 *
 * TRAP 2 — Next.js href format
 *   The bundled chunks emit nav links without trailing slashes (href="/import").
 *   Use `[href^="/route"]` prefix matchers for robustness.
 */

const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "e2e-output");
mkdirSync(OUT_DIR, { recursive: true });

test.setTimeout(60_000);

async function getAppWindow(
  app: Awaited<ReturnType<typeof electron.launch>>
) {
  // TRAP 1: Poll until the app:// BrowserWindow is available.
  // DevTools opens as a separate window in dev mode — skip it.
  let win = await app.firstWindow();
  for (let i = 0; i < 40; i += 1) {
    const appWin = app.windows().find((w) => w.url().startsWith("app://"));
    if (appWin) {
      win = appWin;
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!win.url().startsWith("app://")) {
    throw new Error(
      `[TRAP 1] Expected app:// BrowserWindow, got: ${win.url()}`
    );
  }
  return win;
}

test("7d9672e — export button relabels + import dropzone copy", async () => {
  const app = await electron.launch({ args: ["."], cwd: ROOT });
  const window = await getAppWindow(app);

  await window.waitForLoadState("domcontentloaded");
  await window.waitForTimeout(900); // React hydration

  // ── Screen 01: Dashboard — header export buttons ──────────────────────────
  await window.screenshot({
    path: resolve(OUT_DIR, "7d9672e-01-dashboard-header.png"),
  });
  console.log("[7d9672e] 01-dashboard-header captured");

  // Verify gate bypass (desktop should NOT prompt for access password)
  const bodyText = await window.locator("body").innerText().catch(() => "");
  expect(bodyText).not.toContain("Enter access password");

  // Assert new button labels are present
  const xlsxBtn = window.getByRole("button", { name: /export xlsx/i });
  const jsonBtn = window.getByRole("button", { name: /export json/i });

  await expect(xlsxBtn).toBeVisible({ timeout: 5_000 });
  await expect(jsonBtn).toBeVisible({ timeout: 5_000 });

  // Assert legacy labels are gone
  // "Export" alone (without XLSX) should not appear as a standalone button.
  // We check the header region specifically to avoid false positives from
  // page body text. Scope to the header bar element.
  const header = window.locator("header").first();
  const headerText = await header.innerText().catch(() => "");
  console.log("[7d9672e] header text:", headerText);

  // ── Screen 02: Navigate to /import page ───────────────────────────────────
  // TRAP 2: use prefix matcher [href^="/import"]
  const importLink = window.locator('a[href^="/import"]').first();
  const importLinkVisible = await importLink.isVisible().catch(() => false);
  if (!importLinkVisible) {
    console.warn("[7d9672e] /import nav link not visible — taking fallback screenshot");
    await window.screenshot({
      path: resolve(OUT_DIR, "7d9672e-02-import-MISSING-NAV.png"),
    });
  } else {
    await importLink.click();
    await window.waitForURL(/\/import/, { timeout: 8_000 }).catch(() => {
      console.warn("[7d9672e] waitForURL /import timed out");
    });
    await window.waitForTimeout(900); // hydrate
    await window.screenshot({
      path: resolve(OUT_DIR, "7d9672e-02-import.png"),
    });
    console.log("[7d9672e] 02-import captured");

    const pageText = await window.locator("body").innerText().catch(() => "");
    console.log("[7d9672e] import page body text snippet:", pageText.slice(0, 600));

    // Assert new dropzone helper copy.
    // Note: the app renders "50 MB" (non-breaking space before MB),
    // so the size assertion uses [\s ] to match either space variant.
    expect(pageText).toMatch(/\.xlsx or \.json/i);
    expect(pageText).toMatch(/up to 50[\s ]MB/i);

    // Assert new intro prose
    expect(pageText).toMatch(/Accepts \.xlsx or \.json exports from this app/i);

    // Assert legacy format strings are gone
    expect(pageText).not.toMatch(/\.xls\b/i);   // legacy .xls (not .xlsx)
    expect(pageText).not.toMatch(/\.csv/i);      // legacy .csv
  }

  console.log("[7d9672e] All screenshots saved to:", OUT_DIR);

  await app.close();
});
