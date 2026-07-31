// Update splash renderer (register D-U5).
//
// Renders whatever main pushes and nothing else — it holds no updater state,
// makes no decisions, and cannot cancel or trigger an install. The only thing
// it can ask for is to be closed, and closing it never changes the update.
// PT-primary with an English second line, matching the boot gate.
(function updaterSplash() {
  'use strict';

  const api = window.updaterSplash;
  const dot = document.getElementById('splash-dot');
  const title = document.getElementById('splash-title');
  const sub = document.getElementById('splash-sub');
  const bar = document.getElementById('splash-bar');
  const fill = document.getElementById('splash-fill');
  const hint = document.getElementById('splash-hint');

  // No bridge means the preload did not load. A blank panel that closes on its
  // own timer is the right failure here: this window must never become the
  // thing standing between the operator and selling.
  if (!api) return;

  const HINTS = {
    installing: 'O terminal reinicia sozinho (cerca de 1 min). Não desligue o terminal.'
      + ' / The till restarts by itself — do not switch it off.',
    failed: 'Prima “Reiniciar” no ecrã de arranque para tentar de novo.'
      + ' / Press “Restart” on the boot screen to retry.',
  };

  function setBar(mode, percent) {
    if (mode === 'hidden') {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    if (mode === 'indeterminate') {
      fill.classList.add('indeterminate');
      fill.style.width = '';
      return;
    }
    fill.classList.remove('indeterminate');
    fill.style.width = `${percent}%`;
  }

  function render(state) {
    const version = state && state.version ? String(state.version) : '';
    const currentVersion = state && state.currentVersion ? String(state.currentVersion) : '';
    const percent = typeof (state && state.percent) === 'number' ? Math.round(state.percent) : null;

    if (state.phase === 'downloading' && state.stalled) {
      dot.className = 'dot yellow';
      title.textContent = 'Ligação perdida — a atualização continua mais tarde';
      sub.textContent = 'Connection lost — the update will resume later';
      setBar('hidden');
      hint.hidden = true;
      return;
    }

    if (state.phase === 'downloading') {
      dot.className = 'dot blue';
      title.textContent = ['A transferir atualização', version].filter(Boolean).join(' ')
        + (percent === null ? '' : ` — ${percent}%`);
      sub.textContent = ['Downloading update', version].filter(Boolean).join(' ');
      setBar(percent === null ? 'indeterminate' : 'determinate', percent);
      hint.hidden = true;
      return;
    }

    if (state.phase === 'installing') {
      dot.className = 'dot green';
      title.textContent = ['A instalar atualização', version].filter(Boolean).join(' ');
      sub.textContent = ['Installing update', version].filter(Boolean).join(' ');
      setBar('indeterminate');
      hint.textContent = HINTS.installing;
      hint.hidden = false;
      return;
    }

    if (state.phase === 'failed') {
      dot.className = 'dot red';
      title.textContent = 'Atualização falhou';
      sub.textContent = currentVersion
        ? `Update failed — the till keeps working on ${currentVersion}`
        : 'Update failed — the till keeps working';
      setBar('hidden');
      hint.textContent = HINTS.failed;
      hint.hidden = false;
      return;
    }

    if (state.phase === 'updated') {
      dot.className = 'dot green';
      title.textContent = ['Atualizado para', version].filter(Boolean).join(' ');
      sub.textContent = ['Updated to', version].filter(Boolean).join(' ');
      setBar('hidden');
      hint.hidden = true;
    }
  }

  api.onState((state) => {
    if (state && typeof state.phase === 'string') render(state);
  });

  document.body.addEventListener('click', () => api.dismiss());
}());
