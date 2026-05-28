# fa_client_portal_desktop

Desktop wrapper for [`fa_client_portal`](https://github.com/WaffleSub/fa_client_portal) — the ACE Wealth Advisory client portal.

## Why a separate repo

The web app is a self-contained Next.js + IndexedDB local-first build. Wrapping
it as Electron introduces concerns that don't belong in the web codebase:
process model, IPC surface, native file dialogs, code signing, auto-update,
electron-builder configs.

This repo holds those concerns. It vendors the web app's static-export output
under `web/out/` at build time.

## Local-first / zero-server-PII

The advisor's book lives in IndexedDB under Electron's `userData/` directory
(`~/Library/Application Support/ACE Wealth Advisory/` on macOS,
`%APPDATA%/ACE Wealth Advisory/` on Windows). No client data crosses the
network. Only the auto-updater talks to GitHub Releases.

Auth is dropped in the desktop build — the device IS the user. See the
2026-05-28 entry in `yuki/tasks/lessons.md` for the threat-model reasoning.

## Phases

Tracked in `yuki/tasks/active.md`:

- **D0** — Scaffold (this commit)
- **D1** — Static-export spike + bundle web app
- **D2** — `IS_DESKTOP` flag + drop Supabase auth in desktop build
- **D3** — Native Excel save/open dialogs via contextBridge IPC
- **D4** — electron-builder configs → unsigned `.dmg` + `.exe`
- **D4-bis** — GitHub Actions release workflow
- **D5** — electron-updater + strict CSP lockdown
- **D6** — _(optional)_ Apple Developer ID signing + notarization
- **D7** — Real-machine smoke verification
- **D8** — _(deferred)_ Passphrase + AES-GCM at-rest encryption

## Local dev

```bash
# Install deps (one-time)
npm install

# Dev — compiles TypeScript, launches Electron with placeholder.html
npm run dev

# Compile main + preload only
npm run tsc
```

## Build & release

```bash
# Bundle the web app from ../fa_client_portal/out → web/out (Phase D1+)
npm run build:web

# Compile electron/ → dist/electron + bundle web → produce platform artifacts (Phase D4+)
npm run build
```

## Repo layout

```
fa_client_portal_desktop/
├── electron/                      # Electron main + preload (TypeScript)
│   ├── main.ts                    # app lifecycle, BrowserWindow creation
│   ├── window.ts                  # window factory + webPreferences
│   └── preload.ts                 # contextBridge IPC surface
├── web/out/                       # vendored Next.js static export (gitignored)
├── scripts/                       # build helpers (build-web.sh, release.sh)
├── build/                         # electron-builder resources (icons, entitlements)
├── dist/electron/                 # compiled TypeScript output (gitignored)
├── release/                       # electron-builder output (gitignored)
├── placeholder.html               # D0 hello-world target (replaced in D1)
├── electron-builder.yml           # added in D4
├── tsconfig.json
└── package.json
```

## Source repo

`https://github.com/WaffleSub/fa_client_portal` — companion web build.
The desktop bundle records the source SHA in `web/out/.source-sha` at build
time so the version pin is explicit.

## License

UNLICENSED — internal tool.
