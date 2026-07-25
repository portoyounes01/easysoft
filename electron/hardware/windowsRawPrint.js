// Windows raw-spooler transport — sends raw ESC/POS bytes to a named Windows print
// queue via winspool (OpenPrinter/StartDocPrinter RAW/WritePrinter), the Windows
// equivalent of CUPS `lp -o raw`. Invoked through PowerShell + Add-Type so no native
// Node module is needed; -EncodedCommand (UTF-16LE base64) avoids cmd.exe quoting
// entirely. Requires the printer's Windows QUEUE (its driver keeps usbprint.sys
// ownership — this path coexists with it, unlike libusb direct mode).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
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

// Send raw bytes to a Windows print queue. Resolves { success: true } or throws
// with a diagnosable message (queue missing, offline, WritePrinter refusal).
async function sendRawToWindowsPrinter(printerName, buffer) {
  if (process.platform !== 'win32') {
    throw new Error('sendRawToWindowsPrinter is Windows-only');
  }
  const name = String(printerName ?? '').trim();
  if (!name) throw new Error('No printer queue name given');

  const tempFile = path.join(os.tmpdir(), `pos-raw-${process.pid}-${Date.now()}.bin`);
  fs.writeFileSync(tempFile, buffer);
  try {
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
  } finally {
    try { fs.unlinkSync(tempFile); } catch { /* best effort */ }
  }
}

module.exports = { sendRawToWindowsPrinter, runPowerShell, encodePowerShell };
