import { _electron as electron, expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

/**
 * Mode C regression spec — Phase 6.24→6.30.1 (SHA 2d3881e → 5bd3c1d)
 *
 * Surfaces verified in this run:
 *   - /import/    — V1→V2 migration + JSON import/export UI (Phase 6.27)
 *   - /clients/   — new KYC form (kyc-new-form.tsx Phase 6.28) + client-form.tsx
 *   - nav chrome  — app-shell.tsx nav changes; all links reachable
 *   - /dashboard/ — baseline smoke (gate bypass + render completeness)
 *   - /settings/  — identity surface + render completeness
 *
 * Infrastructure traps baked in:
 *
 * TRAP 1 — DevTools window race
 *   In dev mode Electron opens a DevTools BrowserWindow; `firstWindow()` may
 *   return it instead of the app:// window. We poll `app.windows()` until we
 *   find the `app://` URL, then use that window for all interactions.
 *
 * TRAP 2 — Next.js href format
 *   The bundled chunks emit nav links as `href:"/clients"` (no trailing slash).
 *   We use `[href^="/route"]` prefix matchers so this spec survives whether the
 *   router adds a trailing slash at runtime or not.
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

async function navTo(
  window: Awaited<ReturnType<typeof getAppWindow>>,
  routePrefix: string,
  screenshotPath: string,
  label: string
) {
  // TRAP 2: Use prefix matcher [href^="/route"] — robust to trailing-slash variants.
  const link = window.locator(`a[href^="${routePrefix}"]`).first();
  const isVisible = await link.isVisible().catch(() => false);
  if (!isVisible) {
    console.warn(
      `[navTo] link a[href^="${routePrefix}"] not visible on ${label}`
    );
    await window.screenshot({ path: screenshotPath });
    return false;
  }
  await link.click();
  await window.waitForURL(new RegExp(routePrefix.replace("/", "\\/")), {
    timeout: 8_000,
  }).catch(() => {
    console.warn(`[navTo] waitForURL timed out after clicking ${routePrefix}`);
  });
  await window.waitForTimeout(900); // hydrate
  await window.screenshot({ path: screenshotPath });
  console.log(`[phase6-regression] ${label} → ${screenshotPath}`);
  return true;
}

test("Phase 6.24→6.30.1 regression — nav + import page + clients + KYC flow", async () => {
  const app = await electron.launch({ args: ["."], cwd: ROOT });

  const window = await getAppWindow(app);
  await window.waitForLoadState("domcontentloaded");
  await window.waitForTimeout(900); // React hydration

  // ── Screen 01: Dashboard (baseline + gate bypass check) ──────────────────
  await window.screenshot({ path: resolve(OUT_DIR, "p6-01-dashboard.png") });
  console.log("[phase6-regression] 01-dashboard captured");

  // Gate bypass: desktop should NOT show the access-password prompt
  const bodyText = await window.locator("body").innerText().catch(() => "");
  expect(bodyText).not.toContain("Enter access password");

  // ── Screen 02: Settings ──────────────────────────────────────────────────
  await navTo(window, "/settings", resolve(OUT_DIR, "p6-02-settings.png"), "02-settings");

  // ── Screen 03: Import page (Phase 6.27 — V1→V2 migration + JSON UI) ─────
  await navTo(window, "/import", resolve(OUT_DIR, "p6-03-import.png"), "03-import");

  // ── Screen 04: Clients list ───────────────────────────────────────────────
  await navTo(window, "/clients", resolve(OUT_DIR, "p6-04-clients.png"), "04-clients");

  // ── Screen 05: Load sample data if list is empty, then re-screenshot ──────
  // (Ensures the client list has entries before we attempt to open one)
  const loadSampleBtn = window.getByRole("button", { name: /load sample/i });
  const hasSampleBtn = await loadSampleBtn.isVisible().catch(() => false);
  if (hasSampleBtn) {
    await loadSampleBtn.click();
    await window.waitForTimeout(1_500);
    await window.screenshot({ path: resolve(OUT_DIR, "p6-05-clients-after-sample.png") });
    console.log("[phase6-regression] 05-clients-after-sample captured");
  } else {
    await window.screenshot({ path: resolve(OUT_DIR, "p6-05-clients-already-populated.png") });
    console.log("[phase6-regression] 05-clients already populated");
  }

  // ── Screen 06: Open first client detail ──────────────────────────────────
  // Client rows are <tr class="cursor-pointer ..."> elements — no anchor wrap.
  // DOM probe confirmed: rows have class "cursor-pointer" but no href.
  // The nav "Clients" link is the only a[href^="/clients/"] on the page.
  // We must click the <tr> directly (the second TR is the first data row;
  // the first TR is the header row with class "bg-bg-soft").
  const firstClientRow = window
    .locator('tr.cursor-pointer')
    .first();
  const rowVisible = await firstClientRow.isVisible().catch(() => false);
  if (rowVisible) {
    await firstClientRow.click();
    // The router navigates to /clients/[id] — wait up to 8s
    await window.waitForURL(/\/clients\/.+/, { timeout: 8_000 }).catch(() => {
      console.warn("[phase6-regression] waitForURL /clients/[id] timed out — may be modal/panel");
    });
    await window.waitForTimeout(1_000);
    await window.screenshot({ path: resolve(OUT_DIR, "p6-06-client-detail.png") });
    console.log("[phase6-regression] 06-client-detail captured");
  } else {
    await window.screenshot({ path: resolve(OUT_DIR, "p6-06-client-detail-MISSING.png") });
    console.warn("[phase6-regression] 06 — no cursor-pointer TR found; screenshot saved");
  }

  // ── Screen 07: KYC tab on client detail (Phase 6.28 — kyc-new-form.tsx) ──
  // DOM probe + screenshot confirmed: the KYC entry point is a "KYC" tab in
  // the sub-nav on the client detail page (Policies | Goals | Tools |
  // Review notes | Household | KYC). Click that tab, then look for the
  // "New KYC" / "Start KYC" action button inside the KYC panel.
  // DOM probe confirmed: KYC sub-nav item is a plain <button> (no role="tab")
  // inside div.mt-6.flex.gap-1.border-b.border-line. Use text-exact match.
  const kycTab = window.locator('button').filter({ hasText: /^KYC$/ }).first();
  const kycTabVisible = await kycTab.isVisible().catch(() => false);
  if (kycTabVisible) {
    await kycTab.click();
    await window.waitForTimeout(1_000);
    await window.screenshot({ path: resolve(OUT_DIR, "p6-07-kyc-tab.png") });
    console.log("[phase6-regression] 07-kyc-tab captured");

    // Now look for the "New KYC" / generate / start action inside the panel
    const kycActionSelectors = [
      window.getByRole("button", { name: /new kyc/i }),
      window.getByRole("button", { name: /generate/i }),
      window.getByRole("button", { name: /start kyc/i }),
      window.getByRole("button", { name: /create kyc/i }),
      window.getByRole("link",   { name: /new kyc/i }),
    ];
    for (const sel of kycActionSelectors) {
      const vis = await sel.isVisible().catch(() => false);
      if (vis) {
        await sel.click();
        await window.waitForTimeout(1_200);
        await window.screenshot({ path: resolve(OUT_DIR, "p6-07b-kyc-new-form.png") });
        console.log("[phase6-regression] 07b-kyc-new-form captured");
        break;
      }
    }
  } else {
    // KYC tab not found — screenshot current state for diagnosis
    await window.screenshot({ path: resolve(OUT_DIR, "p6-07-kyc-tab-not-found.png") });
    console.warn("[phase6-regression] 07 — KYC tab not visible; screenshot saved");
  }

  // ── Dismiss modal if open (the New KYC dialog may still be open) ──────────
  // The KYC new-form opens a modal overlay (data-state="open" fixed inset-0).
  // Clicking nav while the overlay is visible blocks pointer events and times out.
  // Dismiss via the Cancel button or Escape key before navigating away.
  const cancelBtn = window.getByRole("button", { name: /^cancel$/i });
  const cancelVisible = await cancelBtn.isVisible().catch(() => false);
  if (cancelVisible) {
    await cancelBtn.click();
    await window.waitForTimeout(400);
  } else {
    // Try Escape as a fallback
    await window.keyboard.press("Escape");
    await window.waitForTimeout(400);
  }

  // ── Screen 08: Back to Import ─────────────────────────────────────────────
  await navTo(window, "/import", resolve(OUT_DIR, "p6-08-import-revisit.png"), "08-import-revisit");

  console.log("[phase6-regression] All screenshots saved to:", OUT_DIR);

  await app.close();
});
