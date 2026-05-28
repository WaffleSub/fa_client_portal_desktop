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

  // Phase D1: load the bundled Next.js static export at web/out/index.html.
  // The renderer takes over routing client-side via Next's <Link> router;
  // hard-loads of deep paths are caught by the did-fail-load handler below.
  const webRoot = path.join(__dirname, "..", "..", "web", "out");
  const entryHtml = path.join(webRoot, "index.html");
  console.log("[window] loading:", entryHtml);
  window.loadFile(entryHtml).catch((err) => {
    console.error("[window] loadFile failed:", err);
  });

  // Deep-link fallback: if Next's client router (or a user reload) tries to
  // resolve a path that isn't a real on-disk file (e.g. /clients/c_abc/
  // when only /clients/_/ exists in the bundle), fall back to index.html
  // and let the client-side router rehydrate from there.
  window.webContents.on("did-fail-load", (_e, code, _desc, validatedURL) => {
    if (code === -6 /* ERR_FILE_NOT_FOUND */ && !validatedURL.endsWith("index.html")) {
      console.warn("[window] deep-link 404, falling back to index.html:", validatedURL);
      window.loadFile(entryHtml).catch((err) => console.error("[window] fallback failed:", err));
    }
  });

  // Open DevTools in dev for quick iteration; Phase D5 will gate this on a flag
  if (process.env.NODE_ENV === "development") {
    window.webContents.openDevTools({ mode: "detach" });
  }

  return window;
}
