import { beforeEach, describe, expect, it } from 'vitest';
import { initializeLocalDatabase, localDb } from '../src/lib/localDatabase';
import { formatTicketNumber, queueTicketService } from '../src/services/queueTicketService';

describe('formatTicketNumber', () => {
  beforeEach(async () => {
    await initializeLocalDatabase();
    await localDb.queueTickets.clear();
  });

  it('pads daily order numbers', () => {
    expect(formatTicketNumber(7, { prefix: '', padding: 3 })).toBe('007');
  });

  it('normalizes and prepends an optional prefix', () => {
    expect(formatTicketNumber(42, { prefix: ' a ', padding: 4 })).toBe('A0042');
  });

  it('issues sequential tickets and resets on a new local day', async () => {
    const settings = { prefix: 'A', startNumber: 1, padding: 3 };
    const first = await queueTicketService.issueTicket(
      'receipt-1',
      settings,
      new Date(2026, 5, 24, 12, 0)
    );
    const second = await queueTicketService.issueTicket(
      'receipt-2',
      settings,
      new Date(2026, 5, 24, 12, 5)
    );
    const nextDay = await queueTicketService.issueTicket(
      'receipt-3',
      settings,
      new Date(2026, 5, 25, 9, 0)
    );

    expect(first.display_number).toBe('A001');
    expect(second.display_number).toBe('A002');
    expect(nextDay.display_number).toBe('A001');
  });
});
