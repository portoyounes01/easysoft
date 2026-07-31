// Boot readiness gate (update-policy §7 / §10 Stage 1).
//
// This page only RENDERS preflight results and asks main to proceed — the checks
// themselves and the proceed-time re-validation run in the main process
// (gatePreflight.js), so selling cannot start from here with red blockers even
// if this script is tampered with.
(function gate() {
  'use strict';

  const api = window.electronAPI && window.electronAPI.gate;
  const badge = document.getElementById('gate-badge');
  const list = document.getElementById('gate-checks');
  const retryButton = document.getElementById('gate-retry');
  const continueButton = document.getElementById('gate-continue');
  const restartButton = document.getElementById('gate-restart');
  const autoNote = document.getElementById('gate-auto-note');
  const footer = document.getElementById('gate-footer');
  const reasonBox = document.getElementById('gate-reason');

  const RECHECK_MS = 5000;
  let busy = false;
  let proceeding = false;
  let latest = null;

  if (!api) {
    badge.className = 'badge badge-blocked';
    badge.textContent = 'ERRO';
    list.innerHTML = '<li class="check"><span class="check-dot red"></span>'
      + '<span class="check-label">Gate bridge indisponível</span>'
      + '<span class="check-detail">window.electronAPI.gate is missing — preload did not load. Reinstall the till application.</span></li>';
    return;
  }

  // Handoff-failure context passed back by main (?reason=load-failed&detail=…).
  const params = new URLSearchParams(window.location.search);
  if (params.get('reason') === 'load-failed') {
    reasonBox.hidden = false;
    reasonBox.textContent = 'A interface falhou a carregar e o terminal voltou ao ecrã de diagnóstico. '
      + `(UI failed to load: ${params.get('detail') || 'unknown error'})`;
  }

  function render(state) {
    latest = state;
    list.innerHTML = '';
    for (const item of state.checks) {
      const li = document.createElement('li');
      li.className = 'check';

      const dot = document.createElement('span');
      dot.className = `check-dot ${item.status}`;

      const label = document.createElement('span');
      label.className = 'check-label';
      label.textContent = item.label;
      const cls = document.createElement('span');
      cls.className = 'check-class';
      cls.textContent = item.class === 'blocking' ? 'bloqueante' : item.class === 'degraded' ? 'aviso' : 'info';
      label.appendChild(cls);

      li.appendChild(dot);
      li.appendChild(label);

      if (item.detail) {
        const detail = document.createElement('span');
        detail.className = 'check-detail';
        detail.textContent = item.detail;
        li.appendChild(detail);
      }
      if (item.fix && item.status !== 'green') {
        const fix = document.createElement('span');
        fix.className = 'check-fix';
        fix.textContent = `→ ${item.fix}`;
        li.appendChild(fix);
      }
      list.appendChild(li);
    }

    if (state.allBlockingGreen) {
      badge.className = 'badge badge-ready';
      badge.textContent = 'PRONTO';
    } else {
      badge.className = 'badge badge-blocked';
      badge.textContent = 'BLOQUEADO';
    }
    continueButton.disabled = !state.allBlockingGreen;
    autoNote.textContent = state.autoProceed
      ? 'Verificação automática a cada 5 s; o terminal continua sozinho quando tudo estiver verde.'
      : 'Continuação automática suspensa após falhas repetidas — use “Continuar” manualmente.';

    footer.textContent = [
      `shell ${state.shellVersion} · hardware API v${state.hardwareApiVersion}`,
      `UI: ${state.source} → ${state.uiUrl}`,
      state.environment ? `ambiente: ${state.environment}` : null,
      `config: ${state.configPath}`,
      `última verificação: ${new Date(state.ranAt).toLocaleTimeString()}`,
    ].filter(Boolean).join('  ·  ');
  }

  async function proceed() {
    // Main re-validates the blocking set (and serializes concurrent callers);
    // a rejection comes back as fresh state.
    if (proceeding) return;
    proceeding = true;
    continueButton.disabled = true;
    try {
      const result = await api.proceed();
      if (result && result.ok === false && result.state) {
        render(result.state);
      }
    } finally {
      proceeding = false;
    }
  }

  async function refresh(auto) {
    if (busy) return;
    busy = true;
    retryButton.disabled = true;
    retryButton.textContent = 'A verificar… / Checking…';
    try {
      const state = await api.getState();
      render(state);
      if (auto && state.allBlockingGreen && state.autoProceed) {
        await proceed();
      }
    } catch (error) {
      badge.className = 'badge badge-blocked';
      badge.textContent = 'ERRO';
      footer.textContent = `gate error: ${error && error.message ? error.message : error}`;
    } finally {
      busy = false;
      retryButton.disabled = false;
      retryButton.textContent = 'Tentar novamente / Retry now';
    }
  }

  retryButton.addEventListener('click', () => refresh(false));
  continueButton.addEventListener('click', () => {
    if (latest && latest.allBlockingGreen) proceed();
  });
  restartButton.addEventListener('click', () => {
    restartButton.disabled = true;
    api.restart();
  });

  refresh(true);
  setInterval(() => refresh(true), RECHECK_MS);
}());
