#!/usr/bin/env node

const { app } = require('electron');
const usbModule = require('usb');

if (typeof usbModule.on !== 'function') {
  usbModule.on = usbModule.usb.on.bind(usbModule.usb);
}

const HardwareController = require('../electron/hardware/hardwareController');

const drawerArgument = process.argv.find((argument) => argument.startsWith('--drawer='));
const drawerNumber = Number(drawerArgument?.split('=')[1] ?? '1');

if (drawerNumber !== 1 && drawerNumber !== 2) {
  console.error('Usage: npm run hardware:test-drawer -- --drawer=1|2');
  app.exit(1);
}

const DRAWER_PIN = drawerNumber - 1;
const PULSE_UNITS = 0x50;
const PULSE_DURATION_MS = PULSE_UNITS * 2;
const MARKER = `DRAWER ${drawerNumber} TEST - DIRECT USB`;

const closeAndExit = (device, exitCode) => {
  if (!device) {
    app.exit(exitCode);
    return;
  }

  device.close(() => app.exit(exitCode));
};

app.whenReady().then(async () => {
  const hardware = new HardwareController();
  const initialization = await hardware.initializeUSBPrinter();
  console.log(JSON.stringify({ initialization }));

  if (!initialization.success || !hardware.device) {
    closeAndExit(hardware.device, 2);
    return;
  }

  const command = Buffer.concat([
    Buffer.from([0x1b, 0x40, 0x1b, 0x70, DRAWER_PIN, PULSE_UNITS, PULSE_UNITS]),
    Buffer.from(`${MARKER}\n\n`),
    Buffer.from([0x1d, 0x56, 0x42, 0x00]),
  ]);

  setTimeout(() => {
    hardware.device.write(command, (error) => {
      if (error) {
        console.error(error);
        closeAndExit(hardware.device, 3);
        return;
      }

      console.log(JSON.stringify({
        success: true,
        method: 'usb',
        drawer: drawerNumber,
        pulseMs: PULSE_DURATION_MS,
        marker: MARKER,
      }));
      closeAndExit(hardware.device, 0);
    });
  }, 500);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
