#!/usr/bin/env node

// Cross-platform printer discovery (USB and Network) with streaming output
// - USB: uses 'usb' package hotplug and snapshot
// - Network: scans common RAW socket port 9100 across a CIDR
// Outputs JSON lines for easy consumption

const os = require('os');
const net = require('net');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

let usbLib = null;
try {
    usbLib = require('usb');
} catch (e) {
    // usb not installed is OK for network-only usage
}

function nowIso() {
    return new Date().toISOString();
}

function emit(event, payload) {
    const line = JSON.stringify({ ts: nowIso(), event, ...payload });
    process.stdout.write(line + '\n');
}

// Parse CIDR like 192.168.1.0/24 into iterable IPs
function cidrToIPs(cidr) {
    const [base, maskStr] = cidr.split('/');
    const mask = Number(maskStr);
    const oct = base.split('.').map(Number);
    const baseInt = (oct[0] << 24) | (oct[1] << 16) | (oct[2] << 8) | oct[3];
    const hostBits = 32 - mask;
    const count = Math.max(0, (1 << hostBits));
    const ips = [];
    for (let i = 1; i < count - 1; i++) {
        const v = baseInt + i;
        ips.push([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join('.'));
    }
    return ips;
}

function inferLocalCIDRs() {
    const nets = os.networkInterfaces();
    const cidrs = new Set();
    for (const name of Object.keys(nets)) {
        for (const ni of nets[name] || []) {
            if (ni.internal || ni.family !== 'IPv4') continue;
            // Heuristic: assume /24 for local LAN if no CIDR given
            const parts = ni.address.split('.').map(Number);
            parts[3] = 0;
            cidrs.add(`${parts.join('.')}\/24`);
        }
    }
    return [...cidrs];
}

async function scanNetwork({ cidrs, port = 9100, timeoutMs = 500, concurrency = 64 }) {
    const targets = cidrs.flatMap(c => cidrToIPs(c));
    emit('network_scan_start', { cidrs, port, targets: targets.length });

    let idx = 0; let active = 0;
    return await new Promise(resolve => {
        function launchNext() {
            while (active < concurrency && idx < targets.length) {
                const ip = targets[idx++];
                active++;
                const socket = new net.Socket();
                let done = false;
                const timer = setTimeout(() => {
                    if (done) return;
                    done = true; active--; socket.destroy();
                    launchNext();
                }, timeoutMs);
                socket.once('connect', () => {
                    clearTimeout(timer);
                    if (!done) {
                        done = true; active--; socket.destroy();
                        emit('network_printer', { ip, port, reachable: true });
                        launchNext();
                    }
                });
                socket.once('error', () => {
                    clearTimeout(timer);
                    if (!done) { done = true; active--; launchNext(); }
                });
                socket.connect(port, ip);
            }
            if (idx >= targets.length && active === 0) {
                emit('network_scan_done', { total: targets.length });
                resolve();
            }
        }
        launchNext();
    });
}

async function listWindowsPrinters() {
    try {
        const ps = 'Get-Printer | Select-Object Name,DriverName,PortName | ConvertTo-Json -Compress';
        const { stdout } = await execAsync(`powershell -NoProfile -Command "${ps}"`);
        const arr = JSON.parse(stdout);
        const printers = Array.isArray(arr) ? arr : (arr ? [arr] : []);
        for (const p of printers) {
            emit('win_printer', { name: p.Name, driver: p.DriverName, port: p.PortName });
        }
    } catch (e) {
        // ignore
    }
}

async function listCUPSPrinters() {
    try {
        const { stdout } = await execAsync('lpstat -p');
        stdout.split('\n').filter(l => l.startsWith('printer ')).forEach(line => emit('cups_printer', { line }));
    } catch { }
}

function watchUSB() {
    if (!usbLib) return;
    try {
        // Snapshot existing devices
        const devices = usbLib.getDeviceList();
        devices.forEach(d => {
            const desc = d.deviceDescriptor || {};
            emit('usb_device', { vendorId: `0x${(desc.idVendor || 0).toString(16)}`, productId: `0x${(desc.idProduct || 0).toString(16)}` });
        });
        // Hotplug events
        usbLib.on('attach', d => {
            const desc = d.deviceDescriptor || {};
            emit('usb_attach', { vendorId: `0x${(desc.idVendor || 0).toString(16)}`, productId: `0x${(desc.idProduct || 0).toString(16)}` });
        });
        usbLib.on('detach', d => {
            const desc = d.deviceDescriptor || {};
            emit('usb_detach', { vendorId: `0x${(desc.idVendor || 0).toString(16)}`, productId: `0x${(desc.idProduct || 0).toString(16)}` });
        });
    } catch { }
}

async function main() {
    const args = process.argv.slice(2);
    const cidrArgs = [];
    let port = 9100; let timeoutMs = 500; let concurrency = 64;
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--cidr' && args[i + 1]) { cidrArgs.push(args[++i]); continue; }
        if (a === '--port' && args[i + 1]) { port = Number(args[++i]) || 9100; continue; }
        if (a === '--timeout' && args[i + 1]) { timeoutMs = Number(args[++i]) || 500; continue; }
        if (a === '--concurrency' && args[i + 1]) { concurrency = Number(args[++i]) || 64; continue; }
        if (a === '--help') {
            console.log('Usage: discover-printers.cjs [--cidr 192.168.1.0/24] [--port 9100] [--timeout 500] [--concurrency 64]');
            process.exit(0);
        }
    }

    const cidrs = cidrArgs.length ? cidrArgs : inferLocalCIDRs();
    emit('start', { platform: process.platform, cidrs, port, timeoutMs, concurrency });

    // List OS-known printers
    if (process.platform === 'win32') { await listWindowsPrinters(); }
    else if (process.platform === 'darwin') { await listCUPSPrinters(); }
    else {
        // print error message
        console.error('Unsupported platform: ' + process.platform);
        process.exit(1);
    }

    // Start USB watcher (if library present)
    watchUSB();

    // Kick off async network scan, but do not block USB events
    await scanNetwork({ cidrs, port, timeoutMs, concurrency });

    emit('done', {});
}

main().catch(err => {
    emit('error', { message: err.message });
    process.exit(1);
});


