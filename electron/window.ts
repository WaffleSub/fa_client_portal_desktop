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
import { BrowserWindow } from "electron";
import path from "node:path";

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

  // Phase D0: placeholder. Phase D1 will switch to loadFile(web/out/index.html).
  const placeholder = path.join(__dirname, "..", "..", "placeholder.html");
  console.log("[window] loading:", placeholder);
  window.loadFile(placeholder).catch((err) => {
    console.error("[window] loadFile failed:", err);
  });

  // Open DevTools in dev for quick iteration; Phase D5 will gate this on a flag
  if (process.env.NODE_ENV === "development") {
    window.webContents.openDevTools({ mode: "detach" });
  }

  return window;
}
