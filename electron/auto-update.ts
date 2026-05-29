/**
 * Auto-update wiring against the GitHub Releases feed declared in
 * electron-builder.yml (publish: github / WaffleSub / fa_client_portal_desktop).
 *
 * Active only when `app.isPackaged` — `npm run dev` skips this entirely.
 *
 * Flow:
 *   on launch → checkForUpdates()
 *   ↳ found newer → autoDownload (default true) → 'update-downloaded'
 *   ↳ notify renderer via IPC → in-app banner ("Update vX ready — Restart")
 *   ↳ user clicks Restart → quitAndInstall() → relaunch into new version
 *   ↳ user ignores → autoInstallOnAppQuit applies on next Cmd+Q
 *
 * Threat model context (yuki/tasks/lessons.md 2026-05-28):
 *   - The .dmg ships unsigned in MVP (D6 adds Apple Developer ID signing).
 *   - electron-updater verifies HTTPS to api.github.com + the artifact's
 *     blockmap signature. Once D6 is on, it also verifies the new binary's
 *     code signature matches the installed publisher — the actual
 *     cryptographic defence against threat 4 (malicious update push).
 *   - Without signing, defence reduces to "trust the GitHub account's 2FA
 *     posture". Acceptable for this no-cloud-data threat model.
 */
import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

export function wireAutoUpdate(window: BrowserWindow): void {
  // Dev runs never call this — but defensive: skip if somehow invoked.
  if (!app.isPackaged) {
    console.log("[updater] skipped: app not packaged (dev session)");
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Re-emit each state to the renderer for the in-app banner. The preload
  // script exposes `window.desktop.onUpdateAvailable()` over these channels.
  autoUpdater.on("checking-for-update", () => {
    console.log("[updater] checking for update");
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[updater] update available:", info.version);
    window.webContents.send("desktop:update-state", {
      state: "downloading",
      version: info.version,
    });
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[updater] up to date");
  });

  autoUpdater.on("download-progress", (p) => {
    window.webContents.send("desktop:update-state", {
      state: "downloading",
      percent: Math.round(p.percent),
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log("[updater] update downloaded:", info.version);
    window.webContents.send("desktop:update-state", {
      state: "ready",
      version: info.version,
      releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : "",
    });
  });

  autoUpdater.on("error", (err) => {
    console.error("[updater] error:", err);
    // Don't surface to the user — failed update checks are quiet. Next
    // launch will try again. Logged for diagnostics only.
  });

  // Fire the first check ~5s after window paint so app feels responsive.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => console.error("[updater] check failed:", e));
  }, 5000);
}

/** Called from the renderer via IPC when the user clicks "Restart to install". */
export function installPendingUpdate(): void {
  // false, true = isSilent, isForceRunAfter — relaunch into the new build
  autoUpdater.quitAndInstall(false, true);
}

/** Manual check (Settings → About → "Check for updates" button). */
export function checkForUpdatesNow(): Promise<void> {
  if (!app.isPackaged) return Promise.resolve();
  return autoUpdater.checkForUpdates().then(() => undefined).catch((e) => {
    console.error("[updater] manual check failed:", e);
  });
}
