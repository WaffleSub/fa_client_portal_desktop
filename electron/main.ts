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
const ASSET_EXT = /\.(js|css|map|woff2?|json|ico|png|svg|jpg|jpeg|webp|txt)$/i;
const INDEX_HTML = path.join(WEB_ROOT, "index.html");

/**
 * Dynamic-route templates produced by Next.js static export.
 *
 * The source repo's generateStaticParams returns a single placeholder
 * `{ clientId: "_" }` per dynamic segment, so the only HTML files emitted
 * for those routes are at the `_` path. At runtime the URL bar still
 * shows the real id (e.g. /clients/c_david/), and useParams() reads it
 * from the live URL. This rewriter maps the requested URL to the right
 * template HTML so the renderer loads the matching page chunks.
 *
 * Order matters — more specific patterns first.
 */
const DYNAMIC_ROUTE_REWRITES: { match: RegExp; template: string }[] = [
  {
    match: /^\/clients\/[^/]+\/summary\/?(?:index\.html)?$/,
    template: "/clients/_/summary/index.html",
  },
  {
    // Excludes /clients/ itself (the list page) which has its own HTML
    match: /^\/clients\/(?!_\/?$)[^/]+\/?(?:index\.html)?$/,
    template: "/clients/_/index.html",
  },
];

function appProtocolHandler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const rawPathname = decodeURIComponent(url.pathname);
  let pathname = rawPathname;

  // Treat any path without a file extension as a directory → /index.html.
  // Catches both `/clients` and `/clients/` style.
  if (!path.extname(pathname)) {
    if (!pathname.endsWith("/")) pathname = pathname + "/";
    pathname = pathname + "index.html";
  }

  // Normalize + path-traversal guard
  const target = path.normalize(path.join(WEB_ROOT, pathname));
  if (!target.startsWith(WEB_ROOT)) {
    return Promise.resolve(new Response("Forbidden", { status: 403 }));
  }

  const isAsset = ASSET_EXT.test(target);

  return net
    .fetch(pathToFileURL(target).toString())
    .catch(() => null)
    .then((res) => {
      if (res && res.status !== 404) return res;

      // Real asset miss → 404 (don't mask with HTML, the renderer expects
      // a script/style and would explode trying to parse HTML as JS).
      if (isAsset) {
        console.warn("[app://] asset 404:", pathname);
        return new Response("Not found", { status: 404 });
      }

      // Dynamic-route rewrite — serve the template HTML for the segment
      // pattern. The browser URL stays as the user-requested path so
      // useParams() resolves the real id.
      const rewrite = DYNAMIC_ROUTE_REWRITES.find((r) => r.match.test(rawPathname));
      if (rewrite) {
        const tmpl = path.normalize(path.join(WEB_ROOT, rewrite.template));
        console.warn("[app://] dynamic route → template:", rawPathname, "→", rewrite.template);
        return net.fetch(pathToFileURL(tmpl).toString());
      }

      // SPA fallback — serve root index.html for any other unknown route.
      console.warn("[app://] route fallback → index.html for:", rawPathname);
      return net.fetch(pathToFileURL(INDEX_HTML).toString());
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
