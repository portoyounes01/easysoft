const { contextBridge, ipcRenderer } = require('electron');

// Deliberately NOT preload.js: this window needs two functions, not the
// hardware/fiscal/deviceStore/gate surface — and not preload.js's synchronous
// safeStorage decrypt on first paint, which is the wrong thing to do while an
// installer is about to take the process down.
contextBridge.exposeInMainWorld('updaterSplash', {
  onState: (callback) => {
    ipcRenderer.on('updater-splash:state', (_event, state) => callback(state));
  },
  dismiss: () => ipcRenderer.send('updater-splash:dismiss'),
});
