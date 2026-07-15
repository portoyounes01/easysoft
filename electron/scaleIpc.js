const ScaleController = require('./hardware/scaleController');

/**
 * Register the weighing-scale IPC surface. Mirrors registerFiscalSigningIpc:
 * self-contained module, 'scale:' channel namespace, { success, error? }
 * envelopes, push events to whichever renderer called scale:start.
 *
 * @param {import('electron').IpcMain} ipcMain
 * @param {import('electron').App} app
 * @returns {import('./hardware/scaleController')} controller for lifecycle cleanup
 */
function registerScaleIpc(ipcMain, app) {
  const controller = new ScaleController({ getUserDataDir: () => app.getPath('userData') });

  const wrap = (fn) => async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  ipcMain.handle('scale:get-status', wrap(() => controller.getStatus()));
  ipcMain.handle('scale:get-config', wrap(() => ({ success: true, config: controller.getConfig() })));
  ipcMain.handle('scale:set-config', wrap((_event, patch) => controller.setConfig(patch ?? {})));
  ipcMain.handle('scale:list-ports', wrap(() => controller.listPorts()));
  // A manual scan must not race the poll loop for the ports (the loser opens
  // 'busy' and the scale would be misreported). Enforced here, not just in
  // the panel's disabled button, so a reloaded renderer can't bypass it.
  ipcMain.handle(
    'scale:detect',
    wrap(() =>
      controller.polling
        ? { success: false, found: false, results: [], error: 'Stop the live reading before scanning ports' }
        : controller.detect()
    )
  );
  ipcMain.handle('scale:read-once', wrap(() => controller.readOnce()));
  ipcMain.handle('scale:stop', wrap(() => controller.stop()));

  ipcMain.handle(
    'scale:start',
    wrap((event) => {
      const sender = event.sender;
      controller.setEmitter({
        reading: (reading) => {
          if (!sender.isDestroyed()) sender.send('scale-reading', reading);
        },
        status: (status) => {
          if (!sender.isDestroyed()) sender.send('scale-status-change', status);
        },
      });
      return controller.start();
    })
  );

  return controller;
}

module.exports = { registerScaleIpc };
