import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { SettingsProvider, useSettings } from '../src/contexts/SettingsContext';

const SettingsProbe = () => {
  const { settings, isLoading } = useSettings();

  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="issuer">{settings.fiscal.issuer}</span>
      <span data-testid="vendus-enabled">{String(settings.fiscal.vendus.enabled)}</span>
      <span data-testid="invoicexpress-enabled">{String(settings.fiscal.invoicexpress.enabled)}</span>
      <span data-testid="fiskaly-enabled">{String(settings.fiscal.fiskaly.enabled)}</span>
      <span data-testid="loyalty-enabled">{String(settings.loyalty.enabled)}</span>
      <span data-testid="points-earned">{settings.loyalty.pointsPerEuroEarned}</span>
      <span data-testid="points-redeemed">{settings.loyalty.pointsPerEuroRedeemed}</span>
      <span data-testid="queue-enabled">{String(settings.orderQueue.enabled)}</span>
      <span data-testid="queue-start">{settings.orderQueue.startNumber}</span>
    </div>
  );
};

function renderSettingsProbe() {
  render(
    <SettingsProvider>
      <SettingsProbe />
    </SettingsProvider>
  );
}

describe('settings defaults', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('selects local AT as the default fiscal issuer in a fresh browser profile', async () => {
    renderSettingsProbe();

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    expect(screen.getByTestId('issuer')).toHaveTextContent('local_at');
    expect(screen.getByTestId('vendus-enabled')).toHaveTextContent('false');
    expect(screen.getByTestId('invoicexpress-enabled')).toHaveTextContent('false');
    expect(screen.getByTestId('fiskaly-enabled')).toHaveTextContent('false');
    expect(screen.getByTestId('loyalty-enabled')).toHaveTextContent('false');
    expect(screen.getByTestId('points-earned')).toHaveTextContent('1');
    expect(screen.getByTestId('points-redeemed')).toHaveTextContent('100');
    expect(screen.getByTestId('queue-enabled')).toHaveTextContent('true');
    expect(screen.getByTestId('queue-start')).toHaveTextContent('1');
  });

  it('keeps local AT selected when migrating stored settings without an issuer field', async () => {
    localStorage.setItem(
      'pos_system_settings',
      JSON.stringify({
        fiscal: {
          trainingMode: false,
        },
      })
    );

    renderSettingsProbe();

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    expect(screen.getByTestId('issuer')).toHaveTextContent('local_at');
  });
});
