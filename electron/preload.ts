/**
 * Preload script — runs in an isolated context with access to Node + the
 * contextBridge. Phase D0 stub: bridges nothing.
 *
 * Phase D3 will expose window.desktop.{saveBook, openBook, getVersion}.
 */
import { contextBridge } from "electron";

// Phase D0 — empty bridge so the renderer sees nothing yet.
contextBridge.exposeInMainWorld("desktop", {
  // saveBook: (filename, bytes) => ipcRenderer.invoke("desktop:save-book", filename, bytes),
  // openBook: () => ipcRenderer.invoke("desktop:open-book"),
});
