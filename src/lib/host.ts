// Host detection for the one-shared-build / two-hosts model (docs/pwa-plan.md §2.2).
//
//   - Till host  = Electron shell: `window.electronAPI` is injected by the preload
//     before any app module runs. Renders POS/checkout/hardware/fiscal issuance.
//   - PWA host   = an ordinary browser (admin/manager): no `window.electronAPI`.
//     Read-only reports/monitoring/management + read-only fiscal. NEVER fiscal writes.
//
// The preload sets `window.electronAPI` synchronously at document start, so this is
// stable for the lifetime of the page — a module-level const is safe. `vite-env.d.ts`
// should type `electronAPI` as optional so this feature-detection is type-enforced.
export const isTillHost: boolean =
  typeof window !== 'undefined' && !!(window as unknown as { electronAPI?: unknown }).electronAPI;

export const isPwaHost: boolean = !isTillHost;
