// CAS PR-II (and protocol-compatible CAS) price-computing scale, RS-232.
//
// The scale is poll/response — it sends nothing until asked:
//   host -> ENQ (0x05)   scale -> ACK (0x06)
//   host -> DC1 (0x11)   scale -> one weight frame:
//     SOH STX <status> <padded weight> <unit> <format byte> ETX EOT
//     01  02  'S'|'U'   "  0.625"      "kg"   'p'           03  04
// Verified line settings: 9600 8-N-1 with DTR and RTS raised.

const ENQ = 0x05;
const ACK = 0x06;
const DC1 = 0x11;

// Longest tokens first so 'kg' wins over 'g'.
const UNIT_PATTERN = /(kg|lb|oz|g|t)/i;
const WEIGHT_PATTERN = /-?\d+(?:\.\d+)?/;

// ASCII payload with framing/control bytes (SOH/STX/ETX/EOT/ACK/...) stripped.
function printablePayload(buffer) {
  let text = '';
  for (const byte of buffer) {
    if (byte >= 0x20 && byte < 0x7f) {
      text += String.fromCharCode(byte);
    }
  }
  return text;
}

// Parse a reply buffer into a reading, or null when no valid frame is present.
function parseScaleFrame(buffer) {
  if (!buffer || buffer.length === 0) {
    return null;
  }
  const payload = printablePayload(buffer);
  if (!payload) {
    return null;
  }

  const weightMatch = payload.match(WEIGHT_PATTERN);
  if (!weightMatch) {
    return null;
  }
  const weight = Number(weightMatch[0]);
  if (!Number.isFinite(weight)) {
    return null;
  }

  const unitMatch = payload.match(UNIT_PATTERN);
  const status = payload.startsWith('S') ? 'stable' : payload.startsWith('U') ? 'unstable' : 'unknown';

  return {
    weight,
    unit: unitMatch ? unitMatch[0].toLowerCase() : null,
    stable: status === 'stable',
    status,
    raw: payload,
  };
}

// A probe reply only counts as a CAS scale when it carries both a number and a
// known weight unit — an ACK alone (or noise) must not claim the port.
function isValidScaleReply(buffer) {
  const reading = parseScaleFrame(buffer);
  return Boolean(reading && reading.unit);
}

module.exports = {
  ENQ,
  ACK,
  DC1,
  parseScaleFrame,
  isValidScaleReply,
};
