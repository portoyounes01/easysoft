// Cross-restart update memory (register D-U5).
//
// `lastStatus` in updater.js is process memory, and quitAndInstall kills the
// process one tick after spawning NSIS — so nothing in-process can tell the
// relaunched build whether the install it just attempted actually took. This
// file is that memory: one small JSON marker in userData, written immediately
// before the install starts and read once at the next boot.
//
// It exists for the failures that are INVISIBLE in-process (NSIS fails
// silently, per-user install refused, power cut mid-install). Failures that
// throw or leave quitAndInstallCalled false are already visible to the caller,
// which clears the marker so they never burn a boot-time attempt.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const MARKER_FILE = 'update-state.json';
// A till switched off for a week must not come back carrying a grudge — and
// this also bounds how long a power-cut false positive can count against a
// version that would install fine.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
// Three, not two: a power cut mid-NSIS is indistinguishable from a genuine
// failure, and two unlucky power cuts must not suppress a good version.
const SUPPRESS_AFTER_ATTEMPTS = 3;

function markerPath() {
  return path.join(app.getPath('userData'), MARKER_FILE);
}

// Anything we cannot make sense of is deleted, not just ignored: a file that
// reads as absent forever is indistinguishable from no file, and leaving it
// there only guarantees the same error is logged on every boot.
function readMarker() {
  try {
    const file = markerPath();
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.targetVersion !== 'string') {
      clearMarker();
      return null;
    }
    return parsed;
  } catch (error) {
    console.error('[update-marker] unreadable, discarding:', error.message);
    clearMarker();
    return null;
  }
}

function clearMarker() {
  try {
    fs.unlinkSync(markerPath());
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[update-marker] clear failed:', error.message);
  }
}

// Synchronous by necessity: the caller runs this on the last tick before
// quitAndInstall. Telemetry must never be the reason an install does not start,
// so every failure here is swallowed after logging.
function writePendingMarker(targetVersion, fromVersion) {
  try {
    const existing = readMarker();
    const carryOver = existing && existing.targetVersion === targetVersion;
    const marker = {
      targetVersion,
      fromVersion,
      startedAt: carryOver && existing.startedAt ? existing.startedAt : new Date().toISOString(),
      attempts: carryOver && Number.isFinite(existing.attempts) ? existing.attempts : 0,
    };
    const file = markerPath();
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(marker));
    fs.renameSync(tmp, file);
  } catch (error) {
    console.error('[update-marker] write failed:', error.message);
  }
}

// Called once at boot, before the window exists. Outcomes:
//   'none'    — nothing pending, or the marker aged out
//   'updated' — the running version IS the version we installed → confirm it
//   'failed'  — the install did not take; suppressVersion is set once the
//               attempts cross the threshold, and gates ONLY the automatic
//               gate-moment install (the manual gate Restart is never gated).
function evaluateMarkerAtBoot() {
  const marker = readMarker();
  if (!marker) return { outcome: 'none' };

  const startedAt = Date.parse(marker.startedAt);
  if (!Number.isFinite(startedAt) || Date.now() - startedAt > STALE_AFTER_MS) {
    clearMarker();
    return { outcome: 'none' };
  }

  if (marker.targetVersion === app.getVersion()) {
    clearMarker();
    return { outcome: 'updated', version: marker.targetVersion };
  }

  const attempts = (Number.isFinite(marker.attempts) ? marker.attempts : 0) + 1;
  try {
    const file = markerPath();
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ ...marker, attempts }));
    fs.renameSync(tmp, file);
  } catch (error) {
    console.error('[update-marker] attempt bump failed:', error.message);
  }
  console.warn('[update-marker] update to', marker.targetVersion, 'did not take; attempt', attempts);

  return {
    outcome: 'failed',
    version: marker.targetVersion,
    attempts,
    suppressVersion: attempts >= SUPPRESS_AFTER_ATTEMPTS ? marker.targetVersion : null,
  };
}

module.exports = { writePendingMarker, clearMarker, evaluateMarkerAtBoot };
