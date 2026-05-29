/**
 * BrowserWindow factory — one window per app run.
 *
 * webPreferences locked down by default:
 *   - contextIsolation:  true   (renderer cannot reach Node primitives)
 *   - nodeIntegration:   false  (no `require()` in the renderer)
 *   - sandbox:           true   (renderer runs in a Chromium sandbox)
 *
 * IPC surface (added in Phase D3) goes through a preload script via
 * contextBridge — that's the only way the renderer can call native APIs.
 */
import { app, BrowserWindow } from "electron";
import path from "node:path";

const APP_ENTRY = "app://local/";

// `path` is imported because the preload script path resolves via it below.
// Asset URL → file mapping moved to main.ts via protocol.handle("app", ...).

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 800;

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: 900,
    minHeight: 600,
    title: "ACE Wealth Advisory",
    backgroundColor: "#faf7f1", // ps-paper — avoids white flash on load
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
    show: false,
  });

  // Show once the renderer has painted — avoids the gray flash
  window.once("ready-to-show", () => {
    window.show();
    console.log("[window] ready-to-show fired");
  });
  window.webContents.on("did-finish-load", () => {
    console.log("[window] did-finish-load fired");
  });
  window.webContents.on("did-fail-load", (_e, code, desc) => {
    console.error("[window] did-fail-load:", code, desc);
  });

  // Phase D2: load through the custom `app://` protocol registered in main.ts.
  // The protocol handler maps URL paths to files under web/out/ AND provides
  // an SPA-style fallback (non-asset, non-existent path → index.html), so
  // client-side router pushes like `/dashboard/` resolve correctly without
  // needing a separate did-fail-load fallback.
  console.log("[window] loading:", APP_ENTRY);
  window.loadURL(APP_ENTRY).catch((err) => {
    console.error("[window] loadURL failed:", err);
  });


  // Phase D5: DevTools open in dev only (npm run dev), hidden in the
  // packaged build. Still reachable in packaged builds via menu / shortcut
  // for diagnostic purposes (Cmd+Opt+I).
  if (!app.isPackaged) {
    window.webContents.openDevTools({ mode: "detach" });
  }

  return window;
}
