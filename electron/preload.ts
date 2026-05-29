/**
 * Preload script — runs in an isolated context with access to Node + the
 * contextBridge. Exposes a narrow, typed API on `window.desktop` for the
 * renderer to call into the main process.
 *
 * Surface today (D5):
 *   onUpdateState(callback)  — subscribe to electron-updater events
 *                              (downloading | ready)
 *   installUpdate()           — apply the downloaded update + relaunch
 *
 * Future:
 *   D3 left native dialogs to Electron's built-in download handler; if
 *   we ever need finer control (last-folder memory, custom filters), the
 *   saveBook/openBook stubs land here.
 */
import { contextBridge, ipcRenderer } from "electron";

type UpdateState =
  | { state: "downloading"; version?: string; percent?: number }
  | { state: "ready"; version: string; releaseNotes: string };

type AppMeta = {
  appVersion: string;
  sourceSha: string;
  isPackaged: boolean;
};

contextBridge.exposeInMainWorld("desktop", {
  onUpdateState(callback: (state: UpdateState) => void): () => void {
    const handler = (_e: unknown, state: UpdateState) => callback(state);
    ipcRenderer.on("desktop:update-state", handler);
    // Return an unsubscribe so React useEffect cleanups can detach cleanly.
    return () => ipcRenderer.removeListener("desktop:update-state", handler);
  },
  installUpdate(): Promise<void> {
    return ipcRenderer.invoke("desktop:install-update");
  },
  getAppMeta(): Promise<AppMeta> {
    return ipcRenderer.invoke("desktop:get-app-meta");
  },
  checkForUpdates(): Promise<void> {
    return ipcRenderer.invoke("desktop:check-for-updates");
  },
});
