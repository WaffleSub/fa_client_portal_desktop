/**
 * Electron main process — owns the app lifecycle, creates the BrowserWindow.
 *
 * Phase D0: hello-world only. Loads placeholder.html so we prove the
 * scaffold boots before wiring the real Next.js bundle in Phase D1.
 *
 * Phase D1 will swap the loadFile target to web/out/index.html.
 * Phase D5 will add the strict CSP + auto-update wiring.
 *
 * Local-first / zero-server-PII model: the renderer never reaches the
 * network for client data. Only the auto-updater (Phase D5) talks to
 * api.github.com.
 */
import { app, BrowserWindow } from "electron";
import { createMainWindow } from "./window";

// Quit when all windows close (mac convention: stay alive in dock until ⌘Q)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.whenReady().then(() => {
  createMainWindow();

  // On mac: re-open a window when the dock icon is clicked and none are open
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});
