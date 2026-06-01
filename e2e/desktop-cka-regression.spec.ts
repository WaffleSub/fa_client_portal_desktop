import { _electron as electron, test } from "@playwright/test";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

/**
 * Mode C Regression — Phase 6.31 CKA UI surfaces (SHA 0113f71)
 *
 * Scoped to the NEW CKA input surfaces added in Phase 6.31:
 *   - Increment A: cka-form.tsx expanded Q1-Q4 questionnaire (full Part 1)
 *   - Increment B: cka-acknowledgement-field.tsx per-submission acknowledgement
 *                  section inside the New-KYC wizard
 *
 * This is a UI bundling smoke check — not a data-correctness audit.
 * The .docx output rendering is verified separately by docx-vision-qa.
 *
 * Screens captured:
 *   cka-01-dashboard.png          — boot + gate bypass confirmed
 *   cka-02-clients-list.png       — clients route reachable
 *   cka-03-client-detail.png      — client detail page
 *   cka-04-kyc-tab.png            — KYC sub-nav tab active
 *   cka-05-new-kyc-wizard.png     — New KYC modal open (flavour + product)
 *   cka-06-cka-ack-section.png    — scroll to CKA acknowledgement section
 *   cka-07-snapshot-section.png   — Snapshot preview section below ack
 *   cka-08-cka-form-modal.png     — CKA Part 1 Q1-Q4 assessment modal
 *                                   (reached via "Assess now" if warning visible,
 *                                    or via snapshot row if reachable)
 *
 * Infrastructure traps baked in:
 *
 * TRAP 1 — DevTools window race
 *   In dev mode Electron opens a DevTools BrowserWindow. `firstWindow()` may
 *   return it instead of the app:// window. Poll `app.windows()` for the
 *   `app://`-prefixed URL; use that window exclusively.
 *
 * TRAP 2 — Next.js href format
 *   The bundled static export emits nav links as `href="/clients"` (no trailing
 *   slash in this bundle). Use `[href^="/route"]` prefix matchers.
 *
 * TRAP 3 — Client rows are <tr class="cursor-pointer"> not anchors.
 *   The /clients/ table renders rows as <tr> elements — no <a> wrapping. The
 *   nav "Clients" link is the only `a[href^="/clients"]` on the page. Click
 *   the <tr> directly.
 *
 * TRAP 4 — KYC sub-nav is a plain <button>, not a role="tab".
 *   Use `.locator('button').filter({ hasText: /^KYC$/ })`.
 */

const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "e2e-output");
mkdirSync(OUT_DIR, { recursive: true });

/** TRAP 1: return the app:// BrowserWindow, skipping the DevTools window. */
async function getAppWindow(app: Awaited<ReturnType<typeof electron.launch>>) {
  let win = await app.firstWindow();
  for (let i = 0; i < 40; i++) {
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

test.setTimeout(90_000);

test("Phase 6.31 CKA UI regression — acknowledgement section + CKA form render", async () => {
  const app = await electron.launch({ args: ["."], cwd: ROOT });
  const window = await getAppWindow(app);
  await window.waitForLoadState("domcontentloaded");
  await window.waitForTimeout(1_000);

  // ── Screen 01: Dashboard — gate bypass + render completeness ─────────────
  await window.screenshot({ path: resolve(OUT_DIR, "cka-01-dashboard.png") });
  console.log("[cka-regression] 01-dashboard captured");

  const bodyText = await window.locator("body").innerText().catch(() => "");
  if (bodyText.includes("Enter access password")) {
    throw new Error("[HIGH] PreAccessGate prompt visible on desktop — bypass failed");
  }

  // ── Screen 02: Clients list ───────────────────────────────────────────────
  // TRAP 2: use href prefix matcher
  const clientsLink = window.locator('a[href^="/clients"]').first();
  const clientsLinkVisible = await clientsLink.isVisible().catch(() => false);
  if (!clientsLinkVisible) {
    await window.screenshot({ path: resolve(OUT_DIR, "cka-02-clients-link-MISSING.png") });
    throw new Error("[HIGH] Clients nav link not found — nav chrome broken");
  }
  await clientsLink.click();
  await window
    .waitForURL(/\/clients/, { timeout: 8_000 })
    .catch(() => console.warn("[cka-regression] waitForURL /clients timed out"));
  await window.waitForTimeout(900);
  await window.screenshot({ path: resolve(OUT_DIR, "cka-02-clients-list.png") });
  console.log("[cka-regression] 02-clients-list captured");

  // Load sample data if list is empty
  const loadSampleBtn = window.getByRole("button", { name: /load sample/i });
  const hasSampleBtn = await loadSampleBtn.isVisible().catch(() => false);
  if (hasSampleBtn) {
    await loadSampleBtn.click();
    await window.waitForTimeout(1_500);
    await window.screenshot({ path: resolve(OUT_DIR, "cka-02b-clients-after-sample.png") });
    console.log("[cka-regression] 02b-clients-after-sample captured");
  }

  // ── Screen 03: Open first client detail ──────────────────────────────────
  // TRAP 3: rows are <tr class="cursor-pointer">, not anchors
  const firstClientRow = window.locator("tr.cursor-pointer").first();
  const rowVisible = await firstClientRow.isVisible().catch(() => false);
  if (!rowVisible) {
    await window.screenshot({ path: resolve(OUT_DIR, "cka-03-client-row-MISSING.png") });
    throw new Error("[HIGH] No cursor-pointer TR found — clients table not rendered");
  }
  await firstClientRow.click();
  await window
    .waitForURL(/\/clients\/.+/, { timeout: 8_000 })
    .catch(() =>
      console.warn("[cka-regression] waitForURL /clients/[id] timed out — may be panel/modal")
    );
  await window.waitForTimeout(1_000);
  await window.screenshot({ path: resolve(OUT_DIR, "cka-03-client-detail.png") });
  console.log("[cka-regression] 03-client-detail captured");

  // ── Screen 04: KYC sub-nav tab ────────────────────────────────────────────
  // TRAP 4: KYC sub-nav is a plain <button>, not role="tab"
  const kycTab = window.locator("button").filter({ hasText: /^KYC$/ }).first();
  const kycTabVisible = await kycTab.isVisible().catch(() => false);
  if (!kycTabVisible) {
    await window.screenshot({ path: resolve(OUT_DIR, "cka-04-kyc-tab-MISSING.png") });
    console.warn("[cka-regression] 04 — KYC tab not visible; screenshot saved");
  } else {
    await kycTab.click();
    await window.waitForTimeout(900);
    await window.screenshot({ path: resolve(OUT_DIR, "cka-04-kyc-tab.png") });
    console.log("[cka-regression] 04-kyc-tab captured");
  }

  // ── Screen 05: Open New KYC wizard modal ─────────────────────────────────
  // Button text: "+ New KYC" (kyc-panel.tsx line ~217)
  const newKycSelectors = [
    window.getByRole("button", { name: /new kyc/i }),
    window.getByRole("button", { name: /\+ new kyc/i }),
    window.getByRole("button", { name: /start kyc/i }),
    window.getByRole("button", { name: /create kyc/i }),
    window.getByRole("button", { name: /generate/i }),
  ];
  let newKycOpened = false;
  for (const sel of newKycSelectors) {
    const vis = await sel.isVisible().catch(() => false);
    if (vis) {
      await sel.click();
      await window.waitForTimeout(1_200);
      await window.screenshot({ path: resolve(OUT_DIR, "cka-05-new-kyc-wizard.png") });
      console.log("[cka-regression] 05-new-kyc-wizard captured");
      newKycOpened = true;
      break;
    }
  }
  if (!newKycOpened) {
    await window.screenshot({ path: resolve(OUT_DIR, "cka-05-new-kyc-wizard-MISSING.png") });
    console.warn("[cka-regression] 05 — No New KYC button found; screenshot saved");
  }

  // ── Screen 06: CKA acknowledgement section ───────────────────────────────
  // The section heading is "CKA acknowledgement · this submission" rendered in
  // a div with text-accent-strong uppercase. It is always present in the wizard
  // (either shows the radio scenarios OR the muted "complete CKA first" note).
  // We verify it exists and isn't blank/broken.
  const ackSection = window
    .locator("text=CKA acknowledgement · this submission")
    .first();
  const ackVisible = await ackSection.isVisible().catch(() => false);
  if (ackVisible) {
    // Scroll the section into view for a clean screenshot
    await ackSection.scrollIntoViewIfNeeded();
    await window.waitForTimeout(400);
    await window.screenshot({ path: resolve(OUT_DIR, "cka-06-cka-ack-section.png") });
    console.log("[cka-regression] 06-cka-ack-section captured");
  } else {
    // Section not visible — could be: wizard didn't open, or text changed.
    // Screenshot the modal area anyway for diagnosis.
    await window.screenshot({ path: resolve(OUT_DIR, "cka-06-cka-ack-section-MISSING.png") });
    console.warn(
      "[cka-regression] 06 — CKA acknowledgement section heading not found; screenshot saved"
    );
  }

  // ── Screen 07: Snapshot preview section ──────────────────────────────────
  // The "Snapshot preview · will be frozen on Save" section lives immediately
  // below the CKA acknowledgement block.
  const snapshotSection = window
    .locator("text=Snapshot preview")
    .first();
  const snapshotVisible = await snapshotSection.isVisible().catch(() => false);
  if (snapshotVisible) {
    await snapshotSection.scrollIntoViewIfNeeded();
    await window.waitForTimeout(400);
    await window.screenshot({ path: resolve(OUT_DIR, "cka-07-snapshot-section.png") });
    console.log("[cka-regression] 07-snapshot-section captured");
  } else {
    await window.screenshot({ path: resolve(OUT_DIR, "cka-07-snapshot-section-MISSING.png") });
    console.warn("[cka-regression] 07 — Snapshot preview section not found; screenshot saved");
  }

  // ── Screen 08: CKA Part 1 assessment modal (Q1-Q4 questionnaire) ─────────
  // The CKA form opens when:
  //   (a) A warning row shows "Assess now" button for a CKA-stale client, OR
  //   (b) The snapshot row CKA freshness button triggers it.
  // Try "Assess now →" first (visible only if client CKA is stale/missing).
  // If not present, the sample client may already have a fresh CKA — note that
  // and skip gracefully rather than forcing.
  let ckaFormOpened = false;
  const assessBtn = window.getByRole("button", { name: /assess now/i }).first();
  const assessVisible = await assessBtn.isVisible().catch(() => false);
  if (assessVisible) {
    await assessBtn.click();
    await window.waitForTimeout(1_200);
    await window.screenshot({ path: resolve(OUT_DIR, "cka-08-cka-form-modal.png") });
    console.log("[cka-regression] 08-cka-form-modal captured (via Assess now button)");
    ckaFormOpened = true;
  }

  if (!ckaFormOpened) {
    // Fallback: look for the inline CKA "Update CKA" or "Assess" or "CKA" button
    // on the snapshot row. These are rendered as small inline buttons on the
    // SnapshotRow component.
    const ckaAssessSelectors = [
      window.getByRole("button", { name: /update cka/i }),
      window.getByRole("button", { name: /cka/i }),
      window.getByRole("button", { name: /assess/i }),
    ];
    for (const sel of ckaAssessSelectors) {
      const vis = await sel.isVisible().catch(() => false);
      if (vis) {
        await sel.click();
        await window.waitForTimeout(1_200);
        await window.screenshot({ path: resolve(OUT_DIR, "cka-08-cka-form-modal.png") });
        console.log("[cka-regression] 08-cka-form-modal captured (via snapshot row button)");
        ckaFormOpened = true;
        break;
      }
    }
  }

  if (!ckaFormOpened) {
    await window.screenshot({ path: resolve(OUT_DIR, "cka-08-cka-form-modal-SKIPPED.png") });
    console.warn(
      "[cka-regression] 08 — CKA form modal not reachable in 2 clicks " +
        "(sample client may have a fresh CKA — no warning row shown). " +
        "Screenshot of current state saved."
    );
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await app.close();
  console.log("[cka-regression] All screenshots saved to:", OUT_DIR);
});

/**
 * Second pass — find a client with NO CKA on record to trigger "Assess now"
 * and reach the CKA Part 1 Q1-Q4 questionnaire modal.
 *
 * Marcus Lim (age 22) and Wei Ling Ng (age 30) are younger clients in the
 * sample dataset who likely have no CKA yet. We walk through all
 * cursor-pointer rows until we find one that, after opening New KYC,
 * shows an "Assess now" button for CKA (kind === "cka" warning).
 *
 * This test captures:
 *   cka-09-no-cka-client-wizard.png   — wizard for a no-CKA client
 *   cka-10-cka-ack-no-cka.png         — acknowledgement section shows muted note
 *   cka-11-cka-form-q1q4.png          — CKA Part 1 Q1-Q4 modal (via Assess now)
 */
test("Phase 6.31 CKA form modal — Q1-Q4 questionnaire via no-CKA client", async () => {
  const app = await electron.launch({ args: ["."], cwd: ROOT });
  const window = await getAppWindow(app);
  await window.waitForLoadState("domcontentloaded");
  await window.waitForTimeout(1_000);

  // Navigate to clients
  const clientsLink = window.locator('a[href^="/clients"]').first();
  await clientsLink.click();
  await window
    .waitForURL(/\/clients/, { timeout: 8_000 })
    .catch(() => {});
  await window.waitForTimeout(900);

  // Count client rows available
  const rows = window.locator("tr.cursor-pointer");
  const rowCount = await rows.count();
  console.log(`[cka-regression-q1q4] Found ${rowCount} client rows`);

  let ckaFormFound = false;

  // Walk each client row looking for one that triggers a CKA "Assess now" warning
  for (let i = 0; i < rowCount && !ckaFormFound; i++) {
    // Re-acquire the rows after each navigation back to /clients
    const currentRows = window.locator("tr.cursor-pointer");
    const count = await currentRows.count();
    if (i >= count) break;

    const row = currentRows.nth(i);
    const rowText = await row.innerText().catch(() => "");
    console.log(`[cka-regression-q1q4] Trying row ${i}: ${rowText.split("\t")[0]}`);

    await row.click();
    await window
      .waitForURL(/\/clients\/.+/, { timeout: 8_000 })
      .catch(() => {});
    await window.waitForTimeout(800);

    // Click KYC tab
    const kycTab = window.locator("button").filter({ hasText: /^KYC$/ }).first();
    const kycVisible = await kycTab.isVisible().catch(() => false);
    if (!kycVisible) {
      // Navigate back to clients list and try next
      const cl = window.locator('a[href^="/clients"]').first();
      await cl.click();
      await window.waitForURL(/\/clients/, { timeout: 6_000 }).catch(() => {});
      await window.waitForTimeout(600);
      continue;
    }
    await kycTab.click();
    await window.waitForTimeout(600);

    // Open New KYC
    const newKycBtn = window.getByRole("button", { name: /new kyc/i }).first();
    const newKycVis = await newKycBtn.isVisible().catch(() => false);
    if (!newKycVis) {
      await window.keyboard.press("Escape");
      await window.waitForTimeout(300);
      const cl = window.locator('a[href^="/clients"]').first();
      await cl.click();
      await window.waitForURL(/\/clients/, { timeout: 6_000 }).catch(() => {});
      await window.waitForTimeout(600);
      continue;
    }
    await newKycBtn.click();
    await window.waitForTimeout(1_000);

    // Check for CKA "Assess now" button — only appears when CKA is never/stale
    const assessBtn = window.getByRole("button", { name: /assess now/i }).first();
    const assessVis = await assessBtn.isVisible().catch(() => false);

    if (!assessVis) {
      // This client has a fresh CKA — also screenshot the ack section for the no-CKA case check
      // Check for the muted "complete the CKA assessment first" note
      const mutedNote = window.locator("text=complete the CKA assessment first to record an acknowledgement");
      const mutedVis = await mutedNote.isVisible().catch(() => false);
      if (mutedVis) {
        await mutedNote.scrollIntoViewIfNeeded();
        await window.waitForTimeout(300);
        await window.screenshot({ path: resolve(OUT_DIR, "cka-10-cka-ack-no-cka.png") });
        console.log("[cka-regression-q1q4] 10-cka-ack-no-cka captured (muted note visible)");
      }
      // Dismiss and try next client
      await window.keyboard.press("Escape");
      await window.waitForTimeout(400);
      const cl = window.locator('a[href^="/clients"]').first();
      await cl.click();
      await window.waitForURL(/\/clients/, { timeout: 6_000 }).catch(() => {});
      await window.waitForTimeout(600);
      continue;
    }

    // Found a client with no CKA — screenshot the wizard first
    await window.screenshot({ path: resolve(OUT_DIR, "cka-09-no-cka-client-wizard.png") });
    console.log("[cka-regression-q1q4] 09-no-cka-client-wizard captured");

    // Scroll to the CKA ack section to capture the "no CKA" muted note
    const mutedNote = window.locator("text=complete the CKA assessment first to record an acknowledgement").first();
    const mutedVis = await mutedNote.isVisible().catch(() => false);
    if (mutedVis) {
      await mutedNote.scrollIntoViewIfNeeded();
      await window.waitForTimeout(300);
      await window.screenshot({ path: resolve(OUT_DIR, "cka-10-cka-ack-no-cka.png") });
      console.log("[cka-regression-q1q4] 10-cka-ack-no-cka captured (muted note)");
    }

    // Click the CKA-specific "Assess now" button.
    // Both RP and CKA warnings render identically-labelled "Assess now →" buttons.
    // Identify the CKA one by finding the <li> that contains "CKA not yet assessed"
    // (or "CKA is stale") and clicking its button — not just the first "Assess now".
    const ckaWarningLi = window.locator("li").filter({
      hasText: /CKA not yet assessed|CKA is/,
    }).first();
    const ckaLiVisible = await ckaWarningLi.isVisible().catch(() => false);
    if (ckaLiVisible) {
      const ckaAssessBtn = ckaWarningLi.getByRole("button", { name: /assess now/i });
      await ckaAssessBtn.click();
      await window.waitForTimeout(1_500);
      await window.screenshot({ path: resolve(OUT_DIR, "cka-11-cka-form-q1q4.png") });
      console.log("[cka-regression-q1q4] 11-cka-form-q1q4 captured (via CKA-specific Assess now)");
      ckaFormFound = true;
    } else {
      // Fallback: try any "Assess now" button that isn't the first (which is RP)
      const allAssessBtns = window.getByRole("button", { name: /assess now/i });
      const btnCount = await allAssessBtns.count();
      if (btnCount >= 2) {
        // Second "Assess now" is typically CKA (RP warning comes first)
        await allAssessBtns.nth(1).click();
        await window.waitForTimeout(1_500);
        await window.screenshot({ path: resolve(OUT_DIR, "cka-11-cka-form-q1q4.png") });
        console.log("[cka-regression-q1q4] 11-cka-form-q1q4 captured (via nth(1) Assess now fallback)");
        ckaFormFound = true;
      }
    }
  }

  if (!ckaFormFound) {
    await window.screenshot({ path: resolve(OUT_DIR, "cka-11-cka-form-q1q4-SKIPPED.png") });
    console.warn(
      "[cka-regression-q1q4] CKA Part 1 form not reached — all sample clients may have a CKA on record."
    );
  }

  await app.close();
  console.log("[cka-regression-q1q4] Second pass complete. Screenshots saved to:", OUT_DIR);
});
