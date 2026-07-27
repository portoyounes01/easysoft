// Windows printer setup: find USB print devices and create a working queue for
// them without the operator hunting a vendor driver.
//
// Why this exists (measured on the till, 2026-07-27 — register D-W4):
//   * Our winspool transport prints with the RAW datatype, which bypasses driver
//     rendering entirely. ANY queue on the right port prints ESC/POS correctly,
//     so the model-matched vendor driver is unnecessary.
//   * `Generic / Text Only` ships in the Windows driver store on every install.
//     `Add-PrinterDriver` stages it with no download and no version matching.
//   * The till had NO queue named for its printer: two queues (XP-90, XP-80C)
//     carrying drivers for other models both sat on the printer's port. Listing
//     devices alongside the queues that share their port makes that visible.

const { runPowerShell } = require('./windowsRawPrint.js');

/** In-box on every Windows install; staged from the driver store on demand. */
const GENERIC_DRIVER = 'Generic / Text Only';

/** Single-quote escaping for a PowerShell literal. */
function psLiteral(value) {
  return String(value ?? '').replace(/'/g, "''");
}

// NOTE for anyone editing the embedded scripts: `$pid` is a READ-ONLY automatic
// variable in PowerShell. Assigning to it throws, and under
// ErrorActionPreference=Stop that kills the enclosing statement — a foreach loop
// then yields an EMPTY result set with no error surfaced. Cost an hour once.
const LIST_DEVICES_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Get-DevProp($id, $key) {
    try { return [string](Get-PnpDeviceProperty -InstanceId $id -KeyName $key -ErrorAction Stop).Data } catch { return '' }
}

$queues = @()
try {
    $queues = @(Get-Printer -ErrorAction SilentlyContinue | ForEach-Object {
        [pscustomobject]@{ name = $_.Name; port = $_.PortName; driver = $_.DriverName }
    })
} catch { }

$devices = @()
foreach ($d in (Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -like 'USBPRINT*' })) {
    $port = ''
    try {
        $port = [string](Get-ItemProperty ("HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\" + $d.InstanceId + "\\Device Parameters") -ErrorAction Stop).PortName
    } catch { }
    if (-not $port -and $d.InstanceId -match '(USB\\d{3})$') { $port = $Matches[1] }

    $parent = Get-DevProp $d.InstanceId 'DEVPKEY_Device_Parent'
    $devVid = ''
    $devPid = ''
    if ($parent -match 'VID_([0-9A-Fa-f]{4})') { $devVid = $Matches[1] }
    if ($parent -match 'PID_([0-9A-Fa-f]{4})') { $devPid = $Matches[1] }

    $service = ''
    if ($parent) { $service = Get-DevProp $parent 'DEVPKEY_Device_Service' }
    if (-not $service) { $service = Get-DevProp $d.InstanceId 'DEVPKEY_Device_Service' }

    $devices += [pscustomobject]@{
        model      = [string]$d.FriendlyName
        instanceId = [string]$d.InstanceId
        service    = $service
        vendorId   = $devVid
        productId  = $devPid
        port       = $port
        status     = [string]$d.Status
        queues     = @($queues | Where-Object { $_.port -eq $port } | ForEach-Object { $_.name })
    }
}

[pscustomobject]@{ devices = @($devices); queues = @($queues) } | ConvertTo-Json -Depth 5 -Compress
`;

/** Parse the last JSON object a script printed (PowerShell may prepend noise). */
function parseJsonTail(stdout) {
  const lines = String(stdout ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].startsWith('{')) {
      try {
        return JSON.parse(lines[i]);
      } catch {
        /* keep looking */
      }
    }
  }
  throw new Error('Could not parse PowerShell output');
}

/** USB print devices with their real driver binding, port, and the queues that
 *  share that port. Replaces guessing the binding from an interface claim. */
async function listUsbPrintDevices() {
  if (process.platform !== 'win32') {
    return { success: false, error: 'Windows only', devices: [], queues: [] };
  }
  try {
    const { stdout } = await runPowerShell(LIST_DEVICES_SCRIPT, { timeout: 30000 });
    const parsed = parseJsonTail(stdout);
    const devices = Array.isArray(parsed.devices) ? parsed.devices : [parsed.devices].filter(Boolean);
    const queues = Array.isArray(parsed.queues) ? parsed.queues : [parsed.queues].filter(Boolean);
    return { success: true, devices, queues };
  } catch (error) {
    console.error('[printer-setup] device listing failed:', error.message);
    return { success: false, error: error.message, devices: [], queues: [] };
  }
}

function buildSetupScript(port, queueName) {
  return `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$driver = '${psLiteral(GENERIC_DRIVER)}'
$queue = '${psLiteral(queueName)}'
$port = '${psLiteral(port)}'
$driverStaged = $false
$queueCreated = $false
$alreadyExisted = $false
try {
    if (-not (Get-PrinterDriver -Name $driver -ErrorAction SilentlyContinue)) {
        Add-PrinterDriver -Name $driver -ErrorAction Stop
        $driverStaged = $true
    }
    $existing = Get-Printer -Name $queue -ErrorAction SilentlyContinue
    if ($existing) {
        # Name-only reuse would silently adopt a queue pointing somewhere else
        # (stale entry, a second identical printer, a dead USB port) and then
        # route every receipt to it. Fail loudly instead.
        if ($existing.PortName -ne $port) {
            throw "A printer named '$queue' already exists on port $($existing.PortName), not $port"
        }
        $alreadyExisted = $true
    } else {
        Add-Printer -Name $queue -DriverName $driver -PortName $port -ErrorAction Stop
        $queueCreated = $true
    }
    [pscustomobject]@{ ok = $true; driverStaged = $driverStaged; queueCreated = $queueCreated; alreadyExisted = $alreadyExisted; queue = $queue } | ConvertTo-Json -Compress
} catch {
    [pscustomobject]@{ ok = $false; error = [string]$_.Exception.Message; driverStaged = $driverStaged } | ConvertTo-Json -Compress
}
`;
}

/** Windows error text is localized (the reference till reports in Portuguese),
 *  so an access-denied check cannot rely on English. Match the common stems and
 *  let the caller offer an elevated retry regardless of the verdict. */
function looksLikeAccessDenied(message) {
  return /denied|negad|negá|permiss|privil|acesso|acceso/i.test(String(message ?? ''));
}

/** Stage the in-box driver and create a queue on `port`.
 *  Returns { success, queue, driverStaged, queueCreated, alreadyExisted,
 *            needsElevation, error }. */
async function setupUsbPrinterQueue({ port, queueName }) {
  if (process.platform !== 'win32') {
    return { success: false, error: 'Windows only' };
  }
  const targetPort = String(port ?? '').trim();
  const targetQueue = String(queueName ?? '').trim();
  if (!targetPort) return { success: false, error: 'No printer port given' };
  if (!targetQueue) return { success: false, error: 'No queue name given' };
  // Windows rejects these in printer names; catch it here rather than as an
  // opaque spooler failure.
  if (/[\\!,]/.test(targetQueue)) {
    return { success: false, error: 'Printer name cannot contain \\ ! or ,' };
  }

  try {
    const { stdout } = await runPowerShell(buildSetupScript(targetPort, targetQueue), { timeout: 60000 });
    const parsed = parseJsonTail(stdout);
    if (parsed.ok) {
      return {
        success: true,
        queue: targetQueue,
        driverStaged: parsed.driverStaged === true,
        queueCreated: parsed.queueCreated === true,
        alreadyExisted: parsed.alreadyExisted === true,
      };
    }
    return {
      success: false,
      error: parsed.error || 'Printer setup failed',
      needsElevation: looksLikeAccessDenied(parsed.error),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      needsElevation: looksLikeAccessDenied(error.message),
    };
  }
}

module.exports = {
  GENERIC_DRIVER,
  listUsbPrintDevices,
  setupUsbPrinterQueue,
  __testInternals: { parseJsonTail, looksLikeAccessDenied, buildSetupScript, psLiteral },
};
