// The UI↔shell version contract (update-policy §8 / §10 Stage 3).
//
// HARDWARE_API_VERSION numbers the preload surface (`electronAPI.*`). Bump it on
// any BREAKING change to that surface — removed/renamed methods, changed return
// shapes — never for additions (additions are backward-tolerant by P1). The web
// build publishes shell-requirements.json declaring the minimum shell it can
// drive; the boot gate refuses handoff when this shell is older.
const HARDWARE_API_VERSION = 1;

// Dotted-numeric comparison ('1.2.10' > '1.2.9'); tolerant of a leading 'v' and
// of unequal segment counts. Non-numeric segments compare as 0.
function compareVersions(a, b) {
  const parse = (v) =>
    String(v)
      .replace(/^v/i, '')
      .split('.')
      .map((part) => parseInt(part, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const length = Math.max(pa.length, pb.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

module.exports = { HARDWARE_API_VERSION, compareVersions };
