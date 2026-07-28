// Boot readiness preflight (update-policy §7 / §10 Stage 1).
//
// Runs in MAIN so fail-closed enforcement does not depend on gate-page JS: the
// gate renders these results, but `gate:proceed` re-runs the blocking set here
// before the window ever leaves the gate.
//
// Precondition classes (§7.2 — classification is O1, NOT yet user/compliance
// ratified; defaults chosen here, loudly registered in docs/update-policy.md §15):
//   blocking  → red stops handoff (config validity, internet, backend when known,
//               UI source reachable, min-shell-version handshake)
//   degraded  → yellow warns, never blocks (receipt printer, cash drawer — O1
//               open question; over-blocking at boot bricks a till on an
//               unplugged printer, so the conservative default is warn-only)
//   info      → never blocks (missing optional config, absent requirements file)
//
// Labels/fixes are PT-primary with EN after the slash (operators are PT; full
// ES localization of the gate is a registered deferral, D-U1).
const fs = require('fs');
const { net } = require('electron');
const { HARDWARE_API_VERSION, compareVersions } = require('./shellContract');

const CHECK_TIMEOUT_MS = 5000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

async function fetchWithTimeout(url, ms = CHECK_TIMEOUT_MS, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await net.fetch(url, { cache: 'no-store', signal: controller.signal, ...options });
  } finally {
    clearTimeout(timer);
  }
}

function check(id, cls, status, label, detail, fix) {
  return { id, class: cls, status, label, detail: detail || '', fix: fix || '' };
}

// Stage-3 handshake: the web build publishes shell-requirements.json at its root
// (network → fetched from ui_origin; bundled → read from dist/). A missing file
// means "no requirement declared" — old UI builds must keep booting (P1). On
// SPA hosts a missing path returns 200 + index.html (catch-all rewrite), so a
// 200 body that does not parse as JSON is ALSO "not published", never a red.
async function loadShellRequirements(rendererConfig) {
  if (rendererConfig.source === 'network') {
    const url = `${rendererConfig.runtime.uiOrigin}/shell-requirements.json`;
    const response = await fetchWithTimeout(url);
    if (response.status === 404) return { found: false };
    if (!response.ok) throw new Error(`GET ${url} → HTTP ${response.status}`);
    const body = await response.text();
    try {
      return { found: true, requirements: JSON.parse(body) };
    } catch {
      return { found: false };
    }
  }
  const filePath = `${rendererConfig.root}/shell-requirements.json`;
  if (!fs.existsSync(filePath)) return { found: false };
  // Bundled file comes from our own build — unparseable means a broken install,
  // which the caller correctly treats as blocking.
  return { found: true, requirements: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
}

async function checkBackend(runtime) {
  if (!runtime.supabaseUrl) {
    return check('backend', 'info', 'green', 'Serviço backend / Backend',
      'sem supabase_url na configuração — verificado pela interface após o arranque');
  }
  try {
    // The health endpoint requires the (public) anon key: without it hosted
    // Supabase answers 401 — verified empirically 2026-07-24.
    const response = await fetchWithTimeout(`${runtime.supabaseUrl}/auth/v1/health`, CHECK_TIMEOUT_MS, {
      headers: { apikey: runtime.supabaseAnonKey },
    });
    if (response.ok) {
      return check('backend', 'blocking', 'green', 'Serviço backend / Backend', runtime.supabaseUrl);
    }
    return check('backend', 'blocking', 'red', 'Serviço backend / Backend',
      `${runtime.supabaseUrl} → HTTP ${response.status}`,
      'Backend contactável mas com erro — contacte o suporte com o código GATE-BACKEND');
  } catch (error) {
    return check('backend', 'blocking', 'red', 'Serviço backend / Backend',
      `${runtime.supabaseUrl} inacessível: ${error.message}`,
      'Verifique a ligação à internet; se estiver ok, contacte o suporte com o código GATE-BACKEND');
  }
}

async function checkUiSource(rendererConfig) {
  const runtime = rendererConfig.runtime;
  if (rendererConfig.source === 'network') {
    try {
      const response = await fetchWithTimeout(rendererConfig.url);
      if (response.ok) {
        return check('ui-source', 'blocking', 'green', 'Origem da interface / UI origin', runtime.uiOrigin);
      }
      return check('ui-source', 'blocking', 'red', 'Origem da interface / UI origin',
        `${rendererConfig.url} → HTTP ${response.status}`,
        'Origem ativa mas com erro — código GATE-UI; ou reponha renderer_source: "bundled" no config.json e reinicie');
    } catch (error) {
      return check('ui-source', 'blocking', 'red', 'Origem da interface / UI origin',
        `${rendererConfig.url} inacessível: ${error.message}`,
        'Verifique a internet; rollback: renderer_source "bundled" no config.json + Reiniciar');
    }
  }
  const bundled = fs.existsSync(rendererConfig.file);
  return check(
    'ui-source', 'blocking', bundled ? 'green' : 'red', 'Interface local / Bundled UI',
    bundled ? rendererConfig.file : `falta ${rendererConfig.file}`,
    bundled ? '' : 'Reinstale a aplicação do terminal (instalação incompleta)',
  );
}

async function checkShellHandshake(rendererConfig, shellVersion) {
  try {
    const { found, requirements } = await loadShellRequirements(rendererConfig);
    if (!found) {
      return check('shell-version', 'info', 'green', 'Versão do shell / Shell handshake',
        `shell ${shellVersion} / hardware API v${HARDWARE_API_VERSION} — a interface não declara mínimo`);
    }
    const minShell = requirements?.min_shell_version;
    const minHardwareApi = requirements?.min_hardware_api_version;
    const shellTooOld = minShell != null && compareVersions(shellVersion, minShell) < 0;
    const apiTooOld = minHardwareApi != null && HARDWARE_API_VERSION < Number(minHardwareApi);
    if (shellTooOld || apiTooOld) {
      return check('shell-version', 'blocking', 'red', 'Versão do shell / Shell handshake',
        shellTooOld
          ? `shell instalado ${shellVersion} é mais antigo que o mínimo exigido ${minShell}`
          : `hardware API v${HARDWARE_API_VERSION} instalada é mais antiga que o mínimo v${minHardwareApi}`,
        'Atualize o instalador deste terminal e reinicie / update the installer');
    }
    return check('shell-version', 'blocking', 'green', 'Versão do shell / Shell handshake',
      `shell ${shellVersion} ≥ ${minShell ?? 'qualquer'}; hardware API v${HARDWARE_API_VERSION} ≥ v${minHardwareApi ?? 'qualquer'}`);
  } catch (error) {
    // Requirements were published but could not be read — fail closed: an
    // unverifiable handshake must not silently pass (§8).
    return check('shell-version', 'blocking', 'red', 'Versão do shell / Shell handshake',
      `shell-requirements.json ilegível: ${error.message}`,
      'Tente novamente; se persistir, contacte o suporte com o código GATE-HANDSHAKE');
  }
}

// Degraded pending O1: warn, never block at boot. NOTE: the hardware controller
// is initialized by the RENDERER after handoff (hardware:init), so at gate time
// it is usually uninitialized — say that honestly instead of "no printer".
async function checkHardware(hardwareController) {
  try {
    const result = await withTimeout(hardwareController.getHardwareStatus(), CHECK_TIMEOUT_MS, 'hardware status');
    const status = result?.status ?? result; // controller wraps as { success, status }
    if (result?.success === false || !status || status.initialized === false) {
      return [check('printer', 'degraded', 'yellow', 'Impressora de talões / Receipt printer',
        'hardware ainda não inicializado — é verificado pela interface após o arranque',
        'Nada a fazer aqui; o estado real aparece na aplicação')];
    }
    const printerConnected = Boolean(status.printer?.connected);
    const drawerAvailable = Boolean(status.cashDrawer?.available);
    return [
      check('printer', 'degraded', printerConnected ? 'green' : 'yellow', 'Impressora de talões / Receipt printer',
        printerConnected ? (status.printer.name || status.printer.type) : 'nenhuma impressora ligada',
        printerConnected ? '' : 'Verifique o cabo USB/rede e a alimentação da impressora'),
      check('cash-drawer', 'degraded', drawerAvailable ? 'green' : 'yellow', 'Gaveta de dinheiro / Cash drawer',
        drawerAvailable ? '' : 'gaveta não detetada (pagamentos em numerário podem ficar indisponíveis)',
        drawerAvailable ? '' : 'A gaveta é acionada pela impressora de talões — verifique primeiro a impressora'),
    ];
  } catch (error) {
    return [check('printer', 'degraded', 'yellow', 'Impressora de talões / Receipt printer',
      `estado do hardware indisponível: ${error.message}`, 'Verifique os cabos; a venda pode prosseguir')];
  }
}

async function runPreflight({ rendererConfig, hardwareController, shellVersion, updateNotice }) {
  const runtime = rendererConfig.runtime;

  // -- config.json validity (blocking when present-but-broken; absent is fine) --
  const configCheck = runtime.issues.length > 0
    ? check('config', 'blocking', 'red', 'Configuração do terminal / Till config',
        runtime.issues.join(' | '),
        `Corrija ${runtime.filePath} e use o botão Reiniciar (a configuração só é lida no arranque)`)
    : check('config', 'blocking', 'green', 'Configuração do terminal / Till config',
        runtime.exists ? runtime.filePath : 'sem config.json — predefinições internas');

  // -- internet reachability (blocking; v1 is online-required, plan D1) --
  const online = net.isOnline();
  const internetCheck = check(
    'internet', 'blocking', online ? 'green' : 'red', 'Ligação de rede / Network',
    online ? '' : 'sem rota de rede disponível',
    online ? '' : 'Verifique o cabo/Wi-Fi do terminal e o router, depois Tentar novamente',
  );

  // Independent probes run concurrently so the real recheck cadence stays close
  // to the 5s the gate promises (each probe has its own 5s timeout).
  const [backendCheck, uiCheck, shellCheck, hardwareChecks] = await Promise.all([
    checkBackend(runtime),
    checkUiSource(rendererConfig),
    checkShellHandshake(rendererConfig, shellVersion),
    checkHardware(hardwareController),
  ]);

  const checks = [configCheck, internetCheck, backendCheck, uiCheck, shellCheck, ...hardwareChecks];

  // Repeated silent install failures (updateMarker) — info, never blocking: a
  // till that cannot update must still sell. The fix names the gate's own
  // Reiniciar button, which routes through quitAndInstallIfPending and is
  // reachable even when the POS UI is not.
  if (updateNotice) {
    checks.push(check('update-install', 'info', 'yellow', 'Atualização por instalar / Pending update',
      `a instalação da versão ${updateNotice.version} falhou ${updateNotice.attempts}× — instalação automática suspensa`,
      'Prima “Reiniciar” para tentar de novo; se persistir, contacte o suporte com o código GATE-UPDATE'));
  }

  const allBlockingGreen = checks.every((c) => c.class !== 'blocking' || c.status === 'green');

  return {
    checks,
    allBlockingGreen,
    shellVersion,
    hardwareApiVersion: HARDWARE_API_VERSION,
    source: rendererConfig.source,
    uiUrl: rendererConfig.url,
    environment: runtime.environment,
    configPath: runtime.filePath,
    ranAt: new Date().toISOString(),
  };
}

module.exports = { runPreflight };
