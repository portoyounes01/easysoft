// @vitest-environment node
import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { parseCashDrawerStatus } = require('../electron/hardware/cashDrawerStatus.js') as typeof import('../electron/hardware/cashDrawerStatus.js');

describe('cash drawer hardware status', () => {
  it('maps the calibrated low drawer-switch signal to open', () => {
    expect(parseCashDrawerStatus(18)).toEqual({
      status: 'open',
      signal: 'low',
      rawStatus: 18,
    });
  });

  it('maps the calibrated high drawer-switch signal to closed', () => {
    expect(parseCashDrawerStatus(22)).toEqual({
      status: 'closed',
      signal: 'high',
      rawStatus: 22,
    });
  });
});
