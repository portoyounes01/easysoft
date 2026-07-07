import {
  RefreshCcw, XOctagon, Percent, Archive, DoorOpen, Tag, MonitorSmartphone,
  ShieldOff, KeyRound, FileDown, FileWarning, GraduationCap, WifiOff, Wifi, Bell,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NotificationSeverity = 'info' | 'warning' | 'critical';

// Mirrors public.notification_events.
export interface NotificationEvent {
  id: string;
  tenant_id: string;
  store_id: string | null;
  device_id: string | null;
  event_type: string;
  severity: NotificationSeverity;
  actor_employee_id: string | null;
  entity_table: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
  delivered_at: string | null;
  created_at: string;
}

// Icon + human title per event type. (i18n of titles is a follow-up; plain labels for now.)
export const NOTIFICATION_META: Record<string, { icon: LucideIcon; title: string }> = {
  CREDIT_NOTE_ISSUED: { icon: FileDown, title: 'Credit note issued' },
  REFUND_ISSUED: { icon: RefreshCcw, title: 'Refund issued' },
  FISCAL_CANCELLATION: { icon: XOctagon, title: 'Fiscal cancellation' },
  LARGE_DISCOUNT: { icon: Percent, title: 'Large discount' },
  DRAWER_DISCREPANCY: { icon: Archive, title: 'Drawer discrepancy' },
  DRAWER_OPEN_NO_SALE: { icon: DoorOpen, title: 'Drawer opened, no sale' },
  PRICE_OVERRIDE: { icon: Tag, title: 'Price override' },
  DEVICE_ENROLLED: { icon: MonitorSmartphone, title: 'Till enrolled' },
  DEVICE_REVOKED: { icon: ShieldOff, title: 'Till revoked' },
  PAIRING_FAILED: { icon: KeyRound, title: 'Pairing failed' },
  SAFT_GENERATED: { icon: FileDown, title: 'SAF-T generated' },
  FISCAL_ISSUE_FAILED: { icon: FileWarning, title: 'Fiscal issue failed' },
  TRAINING_MODE_CHANGED: { icon: GraduationCap, title: 'Training mode changed' },
  DEVICE_OFFLINE: { icon: WifiOff, title: 'Till offline' },
  DEVICE_ONLINE: { icon: Wifi, title: 'Till back online' },
};

export function notificationMeta(type: string): { icon: LucideIcon; title: string } {
  return NOTIFICATION_META[type] ?? { icon: Bell, title: type };
}

// Tailwind classes per severity (matches the app's palette).
export const SEVERITY_STYLES: Record<NotificationSeverity, { dot: string; text: string; ring: string }> = {
  critical: { dot: 'bg-red-500', text: 'text-red-700', ring: 'ring-red-100' },
  warning: { dot: 'bg-amber-500', text: 'text-amber-700', ring: 'ring-amber-100' },
  info: { dot: 'bg-gray-400', text: 'text-gray-600', ring: 'ring-gray-100' },
};

function money(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? `€${n.toFixed(2)}` : '';
}

// One-line human detail per event, pulled from the event payload. Empty string = show none.
export function notificationDescription(e: NotificationEvent): string {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  const tx = p.transaction_number ? `#${p.transaction_number}` : '';
  switch (e.event_type) {
    case 'REFUND_ISSUED':
      return [tx, money(p.total)].filter(Boolean).join(' · ');
    case 'FISCAL_CANCELLATION':
      return [tx, typeof p.reason === 'string' ? p.reason : ''].filter(Boolean).join(' · ');
    case 'LARGE_DISCOUNT':
      return [tx, money(p.discount) && `${money(p.discount)} off`, p.pct != null ? `${p.pct}%` : '']
        .filter(Boolean).join(' · ');
    case 'FISCAL_ISSUE_FAILED':
      return typeof p.error === 'string' && p.error ? p.error : 'Fiscal issuing failed';
    case 'DRAWER_OPEN_NO_SALE':
      return typeof p.reason === 'string' ? p.reason : 'Drawer opened with no sale attached';
    case 'DEVICE_OFFLINE':
    case 'DEVICE_ONLINE':
      return typeof p.device_name === 'string' ? p.device_name : '';
    default:
      return '';
  }
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
