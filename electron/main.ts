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
import { app, BrowserWindow, protocol, net } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createMainWindow } from "./window";

// Register the custom `app://` scheme as privileged + standard BEFORE app.ready
// fires. This is what lets the renderer follow `app:///dashboard/` style links
// as if they were normal HTTP origins (relative resolution, cookies, fetch).
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true,
    },
  },
]);

const WEB_ROOT = path.join(__dirname, "..", "..", "web", "out");

/**
 * Map any `app://` URL to a file under web/out/. Path resolution rules:
 *   app:///                  → web/out/index.html
 *   app:///dashboard/        → web/out/dashboard/index.html
 *   app:///_next/static/x.js → web/out/_next/static/x.js
 *   any unknown path         → web/out/index.html  (SPA fallback)
 *
 * The fallback lets the client-side router rehydrate deep URLs without 404.
 */
function appProtocolHandler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname = pathname + "index.html";

  // Normalize + path-traversal guard
  const target = path.normalize(path.join(WEB_ROOT, pathname));
  if (!target.startsWith(WEB_ROOT)) {
    return Promise.resolve(new Response("Forbidden", { status: 403 }));
  }

  // SPA fallback — non-asset, non-existent path = serve index.html so the
  // client router can take over.
  return net
    .fetch(pathToFileURL(target).toString())
    .then((res) => {
      if (res.status === 404 && !target.match(/\.(js|css|map|woff2?|json|ico|png|svg|jpg|jpeg|webp|txt)$/i)) {
        return net.fetch(pathToFileURL(path.join(WEB_ROOT, "index.html")).toString());
      }
      return res;
    })
    .catch((err) => {
      console.error("[app://] fetch error:", err, "for", pathname);
      return new Response("Not found", { status: 404 });
    });
}

// Quit when all windows close (mac convention: stay alive in dock until ⌘Q)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.whenReady().then(() => {
  // Wire the app:// protocol now that the app is ready
  protocol.handle("app", appProtocolHandler);

  createMainWindow();

  // On mac: re-open a window when the dock icon is clicked and none are open
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});
