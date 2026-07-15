/**
 * Weighing-scale service (CAS PR-II over RS-232, driven by the Electron shell).
 *
 * Feature-detects the scale IPC surface: in the browser/PWA host, and in
 * packaged shells that predate the scale API, every call fails soft with
 * { success: false } so the UI degrades to manual weight entry.
 */

import type {
  ScaleConfig,
  ScalePortInfo,
  ScaleProbeResult,
  ScaleReading,
  ScaleStatusInfo,
} from '../types/electron';

const NOT_AVAILABLE = 'Scale control not available in this environment';

type ScaleApi = NonNullable<Window['electronAPI']['scale']>;

class ScaleService {
  private getApi(): ScaleApi | null {
    if (typeof window === 'undefined') return null;
    return window.electronAPI?.scale ?? null;
  }

  /** True when the shell exposes the scale API (not a guarantee a scale is attached). */
  isAvailable(): boolean {
    return this.getApi() !== null;
  }

  async getStatus(): Promise<{ success: boolean; status?: ScaleStatusInfo; error?: string }> {
    const api = this.getApi();
    if (!api) return { success: false, error: NOT_AVAILABLE };
    try {
      return await api.getStatus();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async getConfig(): Promise<{ success: boolean; config?: ScaleConfig; error?: string }> {
    const api = this.getApi();
    if (!api) return { success: false, error: NOT_AVAILABLE };
    try {
      return await api.getConfig();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async setConfig(
    config: Partial<Pick<ScaleConfig, 'enabled' | 'port' | 'baud'>>
  ): Promise<{ success: boolean; config?: ScaleConfig; error?: string }> {
    const api = this.getApi();
    if (!api) return { success: false, error: NOT_AVAILABLE };
    try {
      return await api.setConfig(config);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async listPorts(): Promise<{ success: boolean; ports: ScalePortInfo[]; error?: string }> {
    const api = this.getApi();
    if (!api) return { success: false, ports: [], error: NOT_AVAILABLE };
    try {
      return await api.listPorts();
    } catch (error) {
      return {
        success: false,
        ports: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async detect(): Promise<{
    success: boolean;
    found?: boolean;
    port?: string;
    baud?: number;
    results: ScaleProbeResult[];
    error?: string;
  }> {
    const api = this.getApi();
    if (!api) return { success: false, results: [], error: NOT_AVAILABLE };
    try {
      return await api.detect();
    } catch (error) {
      return {
        success: false,
        results: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async readOnce(): Promise<{ success: boolean; reading?: ScaleReading; error?: string }> {
    const api = this.getApi();
    if (!api) return { success: false, error: NOT_AVAILABLE };
    try {
      return await api.readOnce();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async start(): Promise<{ success: boolean; alreadyRunning?: boolean; error?: string }> {
    const api = this.getApi();
    if (!api) return { success: false, error: NOT_AVAILABLE };
    try {
      return await api.start();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async stop(): Promise<{ success: boolean; error?: string }> {
    const api = this.getApi();
    if (!api) return { success: false, error: NOT_AVAILABLE };
    try {
      return await api.stop();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /** Subscribe to live readings; returns an unsubscribe (no-op when unavailable). */
  onReading(callback: (reading: ScaleReading) => void): () => void {
    const api = this.getApi();
    if (!api) return () => {};
    return api.onReading(callback);
  }

  /** Subscribe to status changes; returns an unsubscribe (no-op when unavailable). */
  onStatusChange(callback: (status: ScaleStatusInfo) => void): () => void {
    const api = this.getApi();
    if (!api) return () => {};
    return api.onStatusChange(callback);
  }
}

const scaleService = new ScaleService();

export default scaleService;
export { ScaleService };
