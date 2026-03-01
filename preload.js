// OS3D — Electron Preload Script
// Exposes a secure IPC bridge between the renderer and main process.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('os3d', {
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),
});
