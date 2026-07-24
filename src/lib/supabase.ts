import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';

// Stage-0 runtime config (update-policy §10 / multi-tenant-plan §9.2): on a
// till, the Electron shell reads userData/config.json and exposes the renderer
// subset as window.__RUNTIME_CONFIG__ (via preload). It wins over Vite-baked
// env so a till can be repointed (staging↔prod, key rotation) by editing one
// file — no rebuild. Browser hosts (PWA) have no shell and use the baked env.
const runtimeConfig: { supabaseUrl?: string; supabaseAnonKey?: string; environment?: string } =
    (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__) || {};

// Environment variables (you'll need to add these to your .env file).
// Exported so raw edge-function fetches use the SAME resolution — anything
// reading import.meta.env directly would split-brain a repointed till.
export const supabaseUrl = runtimeConfig.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || '';
export const supabaseAnonKey = runtimeConfig.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON || '';

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase environment variables not configured. Running in offline-only mode.');
}

// Create Supabase client with TypeScript support
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // We're not using OAuth flows in POS
    },
    global: {
        headers: {
            'x-client-info': 'pos-system-v1',
        },
    },
});

// Helper function to check if Supabase is properly configured
export const isSupabaseConfigured = (): boolean => {
    return Boolean(supabaseUrl && supabaseAnonKey);
};

// Helper function to check if we're online and can reach Supabase
export const checkSupabaseConnection = async (): Promise<boolean> => {
    if (!isSupabaseConfigured()) {
        return false;
    }

    try {
        // Use a very lightweight RPC heartbeat to avoid hitting tables and RLS
        const { data, error } = await supabase.rpc('ping');
        if (error) return false;
        return Boolean(data) || data === null; // some PostgREST versions return null for void returns
    } catch (error) {
        console.warn('Supabase connection check failed:', error);
        return false;
    }
};

// Connection status observable
export class ConnectionStatus {
    private static instance: ConnectionStatus;
    private isOnline: boolean = navigator.onLine;
    private isSupabaseOnline: boolean = false;
    private listeners: Array<(status: { isOnline: boolean; isSupabaseOnline: boolean }) => void> = [];
    private checkInterval: number | null = null;
    private checkInFlight: Promise<boolean> | null = null;

    private constructor() {
        // Listen for browser online/offline events
        window.addEventListener('online', this.handleOnlineStatusChange);
        window.addEventListener('offline', this.handleOnlineStatusChange);

        // Start periodic Supabase connection checks
        this.startConnectionChecks();
    }

    public static getInstance(): ConnectionStatus {
        if (!ConnectionStatus.instance) {
            ConnectionStatus.instance = new ConnectionStatus();
        }
        return ConnectionStatus.instance;
    }

    private handleOnlineStatusChange = () => {
        this.isOnline = navigator.onLine;
        this.notifyListeners();

        if (this.isOnline) {
            // When we come back online, immediately check Supabase
            this.checkSupabaseConnectionStatus();
        } else {
            this.isSupabaseOnline = false;
            this.notifyListeners();
        }
    };

    private startConnectionChecks() {
        // Check Supabase connection every 5 seconds
        this.checkInterval = window.setInterval(() => {
            if (this.isOnline) {
                this.checkSupabaseConnectionStatus();
            }
        }, 5000);

        // Initial check
        this.checkSupabaseConnectionStatus();
    }

    private async checkSupabaseConnectionStatus() {
        // Deduplicate concurrent checks
        if (!this.checkInFlight) {
            this.checkInFlight = checkSupabaseConnection()
                .catch(() => false)
                .finally(() => {
                    this.checkInFlight = null;
                });
        }

        const wasOnline = this.isSupabaseOnline;
        this.isSupabaseOnline = await this.checkInFlight;

        if (wasOnline !== this.isSupabaseOnline) {
            this.notifyListeners();
        }
    }

    private notifyListeners() {
        const status = {
            isOnline: this.isOnline,
            isSupabaseOnline: this.isSupabaseOnline,
        };

        this.listeners.forEach(listener => {
            try {
                listener(status);
            } catch (error) {
                console.error('Error in connection status listener:', error);
            }
        });
    }

    public subscribe(listener: (status: { isOnline: boolean; isSupabaseOnline: boolean }) => void) {
        this.listeners.push(listener);

        // Immediately notify with current status
        listener({
            isOnline: this.isOnline,
            isSupabaseOnline: this.isSupabaseOnline,
        });

        // Return unsubscribe function
        return () => {
            const index = this.listeners.indexOf(listener);
            if (index > -1) {
                this.listeners.splice(index, 1);
            }
        };
    }

    public getStatus() {
        return {
            isOnline: this.isOnline,
            isSupabaseOnline: this.isSupabaseOnline,
        };
    }

    public forceCheck() {
        this.checkSupabaseConnectionStatus();
    }

    public destroy() {
        window.removeEventListener('online', this.handleOnlineStatusChange);
        window.removeEventListener('offline', this.handleOnlineStatusChange);

        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }

        this.listeners = [];
    }
}

// Export singleton instance
export const connectionStatus = ConnectionStatus.getInstance(); 