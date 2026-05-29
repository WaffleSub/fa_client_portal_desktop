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

Auth is dropped in the desktop build — the device IS the user. Threat model
covers wrong-PC, stolen laptop, malware-at-rest, malicious update push,
and lost device. Network-based exfiltration is not in scope because no
client data crosses the wire.

## Phases

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
# Bundle the web app from ../fa_client_portal/out → web/out
npm run build:web

# Local release builds (unsigned, MVP tier)
npm run release:mac   # → release/ACE Wealth Advisory-X.Y.Z-universal.dmg
npm run release:win   # → release/ACE Wealth Advisory Setup X.Y.Z.exe (Windows runner only)
```

## Cutting a release via GitHub Actions

The `.github/workflows/release.yml` workflow builds + publishes for both
macOS and Windows whenever a `v*` tag is pushed.

**One-time setup:**

1. Create a fine-grained Personal Access Token at
   [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens):
   - **Repository access:** `WaffleSub/fa_client_portal` (the source repo)
   - **Permissions:** *Contents → Read-only*
2. Add it as a repo secret on this repo named `SOURCE_REPO_PAT`
   (Settings → Secrets and variables → Actions → New repository secret).

**Cutting a release:**

```bash
# Bump version + commit + tag in one command
npm version patch         # 0.0.1 → 0.0.2 (or `minor` / `major`)
git push --follow-tags
```

The workflow then runs on both `macos-latest` and `windows-latest`,
produces the .dmg and .exe, and uploads them to a GitHub Release
(created as a draft so you can write the release notes before publishing).

**First release:** use `v0.0.2-rc.1` style tags while the pipeline is
being shaken out, only cut a clean `v0.0.2` once two green runs in a
row prove it works.

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
