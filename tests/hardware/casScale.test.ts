// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ACK, DC1, ENQ, isValidScaleReply, parseScaleFrame } from '../../electron/hardware/casScale';

// Frame captured from the real CAS PR-II on COM1 (9600 8-N-1):
// SOH STX 'S' '  0.625' 'kg' 'p' ETX EOT
const OBSERVED_FRAME = Buffer.from([
  0x01, 0x02, 0x53, 0x20, 0x20, 0x30, 0x2e, 0x36, 0x32, 0x35, 0x6b, 0x67, 0x70, 0x03, 0x04,
]);

describe('casScale protocol constants', () => {
  it('uses the CAS poll bytes', () => {
    expect(ENQ).toBe(0x05);
    expect(ACK).toBe(0x06);
    expect(DC1).toBe(0x11);
  });
});

describe('parseScaleFrame', () => {
  it('parses the observed stable frame', () => {
    expect(parseScaleFrame(OBSERVED_FRAME)).toEqual({
      weight: 0.625,
      unit: 'kg',
      stable: true,
      status: 'stable',
      raw: 'S  0.625kgp',
    });
  });

  it('parses an unstable frame', () => {
    const frame = Buffer.concat([
      Buffer.from([0x01, 0x02]),
      Buffer.from('U  1.240kgp', 'ascii'),
      Buffer.from([0x03, 0x04]),
    ]);
    const reading = parseScaleFrame(frame);
    expect(reading).toMatchObject({ weight: 1.24, unit: 'kg', stable: false, status: 'unstable' });
  });

  it('parses a negative (tared-below-zero) weight', () => {
    const reading = parseScaleFrame(Buffer.from('S -0.015kg', 'ascii'));
    expect(reading).toMatchObject({ weight: -0.015, unit: 'kg', stable: true });
  });

  it('prefers kg over the embedded g token', () => {
    expect(parseScaleFrame(Buffer.from('S  0.500kg', 'ascii'))?.unit).toBe('kg');
  });

  it('parses grams as a unit', () => {
    expect(parseScaleFrame(Buffer.from('S    625 g', 'ascii'))).toMatchObject({
      weight: 625,
      unit: 'g',
    });
  });

  it('tolerates a leading ACK before the frame', () => {
    const withAck = Buffer.concat([Buffer.from([0x06]), OBSERVED_FRAME]);
    expect(parseScaleFrame(withAck)?.weight).toBe(0.625);
  });

  it('reports unknown status when the flag is missing', () => {
    expect(parseScaleFrame(Buffer.from('  2.000kg', 'ascii'))?.status).toBe('unknown');
  });

  it('returns null for an empty buffer', () => {
    expect(parseScaleFrame(Buffer.alloc(0))).toBeNull();
    expect(parseScaleFrame(null as unknown as Buffer)).toBeNull();
  });

  it('returns null for control bytes only (ACK without data)', () => {
    expect(parseScaleFrame(Buffer.from([0x06]))).toBeNull();
  });

  it('returns null when no number is present', () => {
    expect(parseScaleFrame(Buffer.from('ERROR kg', 'ascii'))).toBeNull();
  });
});

describe('isValidScaleReply (probe validation)', () => {
  it('accepts the observed frame', () => {
    expect(isValidScaleReply(OBSERVED_FRAME)).toBe(true);
  });

  it('rejects a number without a weight unit (not a scale)', () => {
    expect(isValidScaleReply(Buffer.from('OK 200', 'ascii'))).toBe(false);
  });

  it('rejects an ACK-only reply', () => {
    expect(isValidScaleReply(Buffer.from([0x06]))).toBe(false);
  });

  it('rejects random printer chatter', () => {
    expect(isValidScaleReply(Buffer.from('READY', 'ascii'))).toBe(false);
  });
});
