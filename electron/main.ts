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
import { app, BrowserWindow, protocol, net, session, ipcMain } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createMainWindow } from "./window";
import { wireAutoUpdate, installPendingUpdate, checkForUpdatesNow } from "./auto-update";
import { readFileSync } from "node:fs";

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

/**
 * Strict CSP applied to every renderer response. Whitelist-only — the
 * renderer can talk to itself (the app:// origin we registered above)
 * and that's it. No HTTP, no Supabase, no fonts.googleapis.com.
 *
 *   default-src 'self' app:  → the app:// scheme is the only origin
 *   script-src 'self' 'unsafe-inline' → bundled chunks + Next.js's inline
 *     hydration bootstraps. 'unsafe-inline' is the accepted pattern for
 *     Electron desktop apps bundling Next.js static export (VSCode, Slack,
 *     Discord all do this). The "XSS via injected inline script" threat
 *     that 'unsafe-inline' normally opens does not apply here:
 *       - The HTML is bundled at build time — no user-generated HTML
 *       - The renderer is sandboxed (no Node primitives)
 *       - default-src 'self' app: blocks any external script origin
 *     Trade-off accepted; revisit only if we ever render user-generated
 *     HTML in the renderer.
 *   style-src 'self' 'unsafe-inline' → styled-jsx + Tailwind inline styles
 *   img-src 'self' data: blob: → Recharts SVG, data-URI icons
 *   font-src 'self' data:     → Next/font inlines fonts as data: URIs
 *   connect-src 'self'        → no XHR / fetch out (auto-updater runs main-side)
 *   object-src 'none'         → no <object>/<embed>
 *   base-uri 'self'           → can't redirect script base via <base>
 *   form-action 'self'        → POSTs stay on origin
 *
 * The auto-updater talks to api.github.com from the MAIN process, not the
 * renderer, so connect-src 'self' is safe.
 */
const CSP = [
  "default-src 'self' app:",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function applyContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [CSP],
      },
    });
  });
}

app.whenReady().then(() => {
  // Wire the app:// protocol now that the app is ready
  protocol.handle("app", appProtocolHandler);

  // Lock down the renderer's network surface
  applyContentSecurityPolicy();

  const window = createMainWindow();

  // IPC: renderer asks the main process to apply the downloaded update
  ipcMain.handle("desktop:install-update", () => {
    installPendingUpdate();
  });

  // IPC: Settings → About reads version + bundled source SHA
  ipcMain.handle("desktop:get-app-meta", () => {
    let sourceSha = "";
    try {
      sourceSha = readFileSync(path.join(WEB_ROOT, ".source-sha"), "utf8").trim();
    } catch {
      // No .source-sha (dev build via npm run dev that didn't run build-web.sh)
      sourceSha = "dev";
    }
    return {
      appVersion: app.getVersion(),
      sourceSha,
      isPackaged: app.isPackaged,
    };
  });

  // IPC: Settings → "Check for updates" button
  ipcMain.handle("desktop:check-for-updates", () => checkForUpdatesNow());

  // electron-updater — only runs against the GitHub Releases feed when the
  // app is a packaged binary. No-op in dev. Quiet on errors.
  wireAutoUpdate(window);

  // On mac: re-open a window when the dock icon is clicked and none are open
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});
