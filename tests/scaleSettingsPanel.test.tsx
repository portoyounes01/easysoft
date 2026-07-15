import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom';
import ScaleSettingsPanel from '../src/components/ScaleSettingsPanel';
import i18n from '../src/i18n';

const mockScaleApi = () => ({
  getStatus: vi.fn().mockResolvedValue({
    success: true,
    status: {
      state: 'idle',
      polling: false,
      port: null,
      baud: null,
      mock: false,
      lastReading: null,
      lastError: null,
    },
  }),
  getConfig: vi.fn().mockResolvedValue({
    success: true,
    config: { enabled: true, port: 'auto', baud: 9600, lastGoodPort: null, lastGoodBaud: null },
  }),
  setConfig: vi.fn().mockResolvedValue({
    success: true,
    config: { enabled: true, port: 'COM1', baud: 9600, lastGoodPort: null, lastGoodBaud: null },
  }),
  listPorts: vi.fn().mockResolvedValue({
    success: true,
    ports: [{ path: 'COM1', manufacturer: null, vendorId: null, productId: null }],
  }),
  detect: vi.fn().mockResolvedValue({
    success: true,
    found: true,
    port: 'COM1',
    baud: 9600,
    results: [{ port: 'COM1', baud: 9600, outcome: 'answered', reply: 'S  0.625kgp' }],
  }),
  readOnce: vi.fn().mockResolvedValue({
    success: true,
    reading: {
      weight: 0.625,
      unit: 'kg',
      stable: true,
      status: 'stable',
      raw: 'S  0.625kgp',
      timestamp: '2026-07-13T00:00:00.000Z',
    },
  }),
  start: vi.fn().mockResolvedValue({ success: true }),
  stop: vi.fn().mockResolvedValue({ success: true }),
  onReading: vi.fn().mockReturnValue(() => {}),
  onStatusChange: vi.fn().mockReturnValue(() => {}),
});

describe('ScaleSettingsPanel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
    vi.restoreAllMocks();
  });

  test('shows the unavailable notice outside Electron', () => {
    render(<ScaleSettingsPanel embedded />);
    expect(screen.getByText('Scale control is only available on the till application.')).toBeInTheDocument();
  });

  test('renders status, live weight and config when the bridge is present', async () => {
    const api = mockScaleApi();
    (window as unknown as { electronAPI: unknown }).electronAPI = { scale: api };
    render(<ScaleSettingsPanel embedded />);

    await waitFor(() => expect(api.getStatus).toHaveBeenCalled());
    expect(screen.getByText('Weighing Scale')).toBeInTheDocument();
    expect(screen.getByText('Live weight')).toBeInTheDocument();
    expect(screen.getByText('Detect scale')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Scale enabled')).toBeInTheDocument());
  });

  test('read once displays the captured weight and stability', async () => {
    const api = mockScaleApi();
    (window as unknown as { electronAPI: unknown }).electronAPI = { scale: api };
    render(<ScaleSettingsPanel embedded />);
    await waitFor(() => expect(api.getStatus).toHaveBeenCalled());

    await userEvent.click(screen.getByText('Read once'));
    await waitFor(() => expect(screen.getByText('0.625')).toBeInTheDocument());
    expect(screen.getByText('STABLE')).toBeInTheDocument();
  });

  test('detect shows the found port and per-port probe results', async () => {
    const api = mockScaleApi();
    (window as unknown as { electronAPI: unknown }).electronAPI = { scale: api };
    render(<ScaleSettingsPanel embedded />);
    await waitFor(() => expect(api.getStatus).toHaveBeenCalled());

    await userEvent.click(screen.getByText('Detect scale'));
    await waitFor(() =>
      expect(screen.getByText('Scale found on COM1 @ 9600 8-N-1.')).toBeInTheDocument()
    );
    expect(screen.getByText('Scale answered')).toBeInTheDocument();
    expect(screen.getByText('S 0.625kgp')).toBeInTheDocument();
  });
});
