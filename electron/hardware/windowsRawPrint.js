// Windows raw-spooler transport — sends raw ESC/POS bytes to a named Windows print
// queue via winspool (OpenPrinter/StartDocPrinter RAW/WritePrinter), the Windows
// equivalent of CUPS `lp -o raw`. Invoked through PowerShell + Add-Type so no native
// Node module is needed; -EncodedCommand (UTF-16LE base64) avoids cmd.exe quoting
// entirely. Requires the printer's Windows QUEUE (its driver keeps usbprint.sys
// ownership — this path coexists with it, unlike libusb direct mode).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// UTF-16LE base64 for powershell -EncodedCommand (no shell-quoting pitfalls).
function encodePowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

// All PowerShell invocations MUST go through here. execFile (not exec): exec
// routes through cmd.exe, whose command line caps at 8,191 chars — the raw-print
// script below (embedded C# helper → UTF-16LE → base64 ≈ 10K chars) dies there
// with "The command line is too long" before PowerShell ever starts. execFile
// spawns powershell.exe directly (CreateProcess, 32,767-char limit) and passes
// the base64 as an argv entry, so no cmd parsing or quoting is in play at all.
function runPowerShell(script, { timeout = 30000 } = {}) {
  return execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(script)],
    { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
  );
}

// W (Unicode) entry points throughout — winspool is natively Unicode, and the ANSI
// A-variants would narrow queue names through the system codepage ("Impressora
// Térmica" → "Impressora T?rmica" on non-Latin ACPs → OpenPrinter fails).
// FailStage/FailCode expose WHICH winspool call failed and its Win32 error, so a
// missing queue (OpenPrinter 1801) is distinguishable from a mid-job write failure.
const RAW_PRINTER_HELPER_CSHARP = `
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DOCINFOW {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPWStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOW di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
  public static string FailStage = "";
  public static int FailCode = 0;
  public static bool SendBytes(string printerName, byte[] bytes) {
    IntPtr hPrinter; Int32 written = 0;
    DOCINFOW di = new DOCINFOW();
    di.pDocName = "POS Receipt"; di.pDataType = "RAW";
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
      FailStage = "OpenPrinter"; FailCode = Marshal.GetLastWin32Error(); return false;
    }
    bool ok = false;
    if (StartDocPrinter(hPrinter, 1, di)) {
      if (StartPagePrinter(hPrinter)) {
        IntPtr pUnmanaged = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, pUnmanaged, bytes.Length);
        ok = WritePrinter(hPrinter, pUnmanaged, bytes.Length, out written) && written == bytes.Length;
        if (!ok) { FailStage = "WritePrinter"; FailCode = Marshal.GetLastWin32Error(); }
        Marshal.FreeCoTaskMem(pUnmanaged);
        EndPagePrinter(hPrinter);
      } else {
        FailStage = "StartPagePrinter"; FailCode = Marshal.GetLastWin32Error();
      }
      EndDocPrinter(hPrinter);
    } else {
      FailStage = "StartDocPrinter"; FailCode = Marshal.GetLastWin32Error();
    }
    ClosePrinter(hPrinter);
    return ok;
  }
}
`;

// ---------------------------------------------------------------------------
// Persistent raw-print worker.
//
// A one-shot spawn pays PowerShell cold start (~0.5-1s) PLUS an Add-Type C#
// compile (~1-3s) on EVERY job — the operator measured 3-5s from cash sale to
// drawer kick. The worker pays both costs ONCE: it compiles the helper at
// startup, prints WORKER_READY, then serves jobs over stdin (one pure-ASCII
// JSON line each) answering RAW_OK / RAW_FAIL <stage> <code> / RAW_ERR <msg>
// per job. Warm jobs are tens of milliseconds. The stdin loop ends when the
// pipe closes, so the worker can never outlive the Electron process.
// ---------------------------------------------------------------------------
const WORKER_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  `Add-Type -TypeDefinition @'\n${RAW_PRINTER_HELPER_CSHARP}\n'@`,
  "[Console]::Out.WriteLine('WORKER_READY')",
  'while ($null -ne ($line = [Console]::In.ReadLine())) {',
  '  if ($line.Trim().Length -eq 0) { continue }',
  '  try {',
  '    $job = $line | ConvertFrom-Json',
  '    $bytes = [System.IO.File]::ReadAllBytes($job.file)',
  '    if ([RawPrinterHelper]::SendBytes($job.printer, $bytes)) {',
  "      [Console]::Out.WriteLine('RAW_OK')",
  '    } else {',
  "      [Console]::Out.WriteLine('RAW_FAIL ' + [RawPrinterHelper]::FailStage + ' ' + [RawPrinterHelper]::FailCode)",
  '    }',
  '  } catch {',
  "    [Console]::Out.WriteLine('RAW_ERR ' + ($_.Exception.Message -replace '[\\r\\n]+', ' '))",
  '  }',
  '}',
].join('\n');

let rawWorker = null;        // live child process, or null
let rawWorkerReady = null;   // promise that resolves once WORKER_READY arrives
let pendingLine = null;      // waiter { resolve, reject, timer } for the next protocol line
let jobQueue = Promise.resolve(); // serializes jobs so protocol lines never interleave
let tempSeq = 0;             // same-millisecond temp-file name collisions

// Timeouts are variables (not consts) solely so the protocol harness can
// shrink them; production values never change at runtime.
let START_TIMEOUT_MS = 20000;
let JOB_TIMEOUT_MS = 30000;

// Job lines must be pure ASCII: redirected-stdin encoding on PS 5.1 is
// codepage-dependent, but \uXXXX escapes survive any of them and
// ConvertFrom-Json decodes them back.
function asciiJsonLine(obj) {
  return JSON.stringify(obj).replace(/[\u0080-\uffff]/g,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

// Resolve/reject always clear BOTH the slot and the waiter's own timer —
// a timer that outlives its waiter must find pendingLine !== itself and do
// nothing (an unscoped stale timer here killed healthy in-flight jobs 30s
// after every earlier job; caught in review before it ever shipped).
function settlePending(kind, value) {
  if (!pendingLine) return;
  const p = pendingLine;
  pendingLine = null;
  if (p.timer) clearTimeout(p.timer);
  if (kind === 'resolve') p.resolve(value);
  else p.reject(value);
}

function failPending(error) {
  settlePending('reject', error);
}

function dropRawWorker() {
  const w = rawWorker;
  rawWorker = null;
  rawWorkerReady = null;
  if (w) {
    try { w.stdin.end(); } catch { /* already closed */ }
    try { w.kill(); } catch { /* already dead */ }
  }
  failPending(new Error('raw-print worker stopped'));
}

function ensureRawWorker() {
  if (rawWorker && rawWorkerReady) return rawWorkerReady;

  const child = spawn('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(WORKER_SCRIPT)],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  rawWorker = child;

  let stdoutBuf = '';
  child.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString('utf8');
    let idx;
    while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
      const line = stdoutBuf.slice(0, idx).replace(/\r$/, '');
      stdoutBuf = stdoutBuf.slice(idx + 1);
      if (!line) continue;
      settlePending('resolve', line);
      // No waiter (e.g. output after a timeout already gave up): dropped —
      // the worker is killed on timeout, so stale lines cannot mispair.
    }
  });
  child.stderr.on('data', (chunk) => {
    const text = String(chunk).trim();
    if (text) console.error('[rawprint-worker] stderr:', text.slice(0, 300));
  });
  child.on('error', (error) => {
    console.error('[rawprint-worker] spawn error:', error.message);
    if (rawWorker === child) dropRawWorker();
  });
  child.on('close', (code) => {
    if (rawWorker === child) {
      console.error(`[rawprint-worker] exited (code ${code})`);
      dropRawWorker();
    }
  });

  rawWorkerReady = new Promise((resolve, reject) => {
    const waiter = {
      resolve: (line) => (line === 'WORKER_READY'
        ? resolve()
        : reject(new Error(`unexpected worker greeting: ${line.slice(0, 120)}`))),
      reject,
      timer: null,
    };
    pendingLine = waiter;
    // First start compiles the C# helper — allow a generous window. Identity
    // check: this timer must only ever fire against ITS OWN waiter.
    waiter.timer = setTimeout(() => {
      if (pendingLine === waiter) {
        failPending(new Error('raw-print worker start timed out'));
        dropRawWorker();
      }
    }, START_TIMEOUT_MS);
    waiter.timer.unref?.();
  });
  return rawWorkerReady;
}

// Resolves {status:'ok'} | {status:'refused', message} — refusals are REAL
// answers from winspool (wrong queue name, mid-job write failure) and must not
// be retried. Throws only on transport failure (worker died / start failed /
// timed out); every thrown error carries .jobDelivered so the caller can tell
// "never reached the worker" (safe to retry) from "delivered, reply lost"
// (may already have PRINTED — a retry would double-print, never do it).
function runJobViaWorker(name, tempFile) {
  return new Promise((resolve, reject) => {
    jobQueue = jobQueue.then(async () => {
      try {
        await ensureRawWorker();
      } catch (startError) {
        startError.jobDelivered = false; // nothing was ever sent
        throw startError;
      }
      const answer = await new Promise((res, rej) => {
        const waiter = {
          resolve: res,
          reject: (err) => {
            if (err.jobDelivered === undefined) err.jobDelivered = waiter.delivered;
            rej(err);
          },
          timer: null,
          delivered: false,
        };
        pendingLine = waiter;
        waiter.timer = setTimeout(() => {
          if (pendingLine === waiter) {
            failPending(new Error(`raw-print job timed out after ${JOB_TIMEOUT_MS / 1000}s`));
            dropRawWorker(); // a wedged WritePrinter must not stall later jobs
          }
        }, JOB_TIMEOUT_MS);
        waiter.timer.unref?.();
        try {
          rawWorker.stdin.write(`${asciiJsonLine({ printer: name, file: tempFile })}\n`, (err) => {
            if (err) {
              err.jobDelivered = false; // write refused → provably never sent
              failPending(err);
            } else if (pendingLine === waiter) {
              waiter.delivered = true; // flushed to the worker's pipe
            }
          });
        } catch (writeError) {
          writeError.jobDelivered = false;
          failPending(writeError);
        }
      });
      if (answer === 'RAW_OK') return { status: 'ok' };
      const fail = answer.match(/^RAW_FAIL (\S+) (-?\d+)$/);
      if (fail) {
        return {
          status: 'refused',
          message: `${fail[1]} failed (Win32 error ${fail[2]}) for queue [${name}] - error 1801 means the queue name does not exist`,
        };
      }
      if (answer.startsWith('RAW_ERR ')) {
        return { status: 'refused', message: answer.slice(8, 308) };
      }
      throw new Error(`unexpected worker reply: ${answer.slice(0, 120)}`);
    }).then(resolve, reject);
    // Keep the chain alive for the next job whatever happened to this one.
    jobQueue = jobQueue.catch(() => {});
  });
}

// One-shot fallback: the pre-worker path, proven on the till (0.1.5). Used
// only when the worker transport itself is broken.
async function sendRawOneShot(name, tempFile) {
  // PS single-quoted strings: only ' needs escaping (doubled).
  const psName = name.replace(/'/g, "''");
  const psPath = tempFile.replace(/'/g, "''");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    // UTF-8 stderr so error text with accents survives Node's utf8 decode
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    `Add-Type -TypeDefinition @'\n${RAW_PRINTER_HELPER_CSHARP}\n'@`,
    `$bytes = [System.IO.File]::ReadAllBytes('${psPath}')`,
    `if ([RawPrinterHelper]::SendBytes('${psName}', $bytes)) { Write-Output 'RAW_OK' } else { throw ([RawPrinterHelper]::FailStage + ' failed (Win32 error ' + [RawPrinterHelper]::FailCode + ') for queue [' + '${psName}' + '] - error 1801 means the queue name does not exist') }`,
  ].join('\n');
  let stdout;
  try {
    ({ stdout } = await runPowerShell(script, { timeout: 30000 }));
  } catch (execError) {
    // spawn errors embed the whole base64 command line — surface stderr instead
    const stderr = String(execError.stderr || '').trim();
    throw new Error(stderr ? stderr.split('\n')[0].slice(0, 300) : `Raw print failed (${execError.code ?? 'exec error'})`);
  }
  if (!stdout.includes('RAW_OK')) {
    throw new Error(`Raw print did not confirm: ${stdout.trim().slice(0, 300)}`);
  }
  return { success: true };
}

// Send raw bytes to a Windows print queue. Resolves { success: true } or throws
// with a diagnosable message (queue missing, offline, WritePrinter refusal).
async function sendRawToWindowsPrinter(printerName, buffer) {
  if (process.platform !== 'win32') {
    throw new Error('sendRawToWindowsPrinter is Windows-only');
  }
  const name = String(printerName ?? '').trim();
  if (!name) throw new Error('No printer queue name given');

  const tempFile = path.join(os.tmpdir(), `pos-raw-${process.pid}-${Date.now()}-${++tempSeq}.bin`);
  fs.writeFileSync(tempFile, buffer);
  try {
    let outcome = null;
    try {
      outcome = await runJobViaWorker(name, tempFile);
    } catch (transportError) {
      console.error('[rawprint] worker transport failed:', transportError.message);
      dropRawWorker();
      // Delivered-but-no-reply means the bytes may ALREADY be printed (drawer
      // kicked, receipt out). Auto-resending would double-print on a fiscal
      // till — surface the ambiguity instead and let a human decide.
      if (transportError.jobDelivered) {
        throw new Error(`Print outcome unknown (${transportError.message}) — check the printer before reprinting`);
      }
      // Provably never sent → one retry with a fresh worker, then the proven
      // one-shot path.
      try {
        outcome = await runJobViaWorker(name, tempFile);
      } catch (retryError) {
        if (retryError.jobDelivered) {
          throw new Error(`Print outcome unknown (${retryError.message}) — check the printer before reprinting`);
        }
        console.error('[rawprint] worker retry failed, one-shot fallback:', retryError.message);
        return await sendRawOneShot(name, tempFile);
      }
    }
    if (outcome.status === 'ok') return { success: true };
    throw new Error(outcome.message);
  } finally {
    try { fs.unlinkSync(tempFile); } catch { /* best effort */ }
  }
}

// Fire-and-forget warm-up so the FIRST sale of the day already has a compiled
// worker (call when a Windows queue becomes the configured transport).
function warmWindowsRawPrintWorker() {
  if (process.platform !== 'win32') return;
  ensureRawWorker().catch((error) => {
    console.error('[rawprint] warm-up failed:', error.message);
  });
}

function shutdownWindowsRawPrint() {
  dropRawWorker();
}

module.exports = {
  sendRawToWindowsPrinter,
  warmWindowsRawPrintWorker,
  shutdownWindowsRawPrint,
  runPowerShell,
  encodePowerShell,
  // Worker internals for the protocol test harness (exercised on any platform
  // by putting a fake powershell.exe on PATH) — not part of the app surface.
  __rawPrintTestInternals: {
    ensureRawWorker,
    runJobViaWorker,
    dropRawWorker,
    asciiJsonLine,
    setTimeoutsForTest: (start, job) => { START_TIMEOUT_MS = start; JOB_TIMEOUT_MS = job; },
  },
};
