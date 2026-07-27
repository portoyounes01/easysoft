import React from 'react';
import { useTranslation } from 'react-i18next';
import { Wifi, WifiOff, BellOff } from 'lucide-react';
import { AdminActionButton } from '../ui/AdminActionButton';
import { useNotificationFeed } from '../../contexts/NotificationFeedContext';
import {
  notificationMeta, notificationDescription, relativeTime, SEVERITY_STYLES,
} from '../../lib/notificationTypes';

interface Props {
  onClose: () => void;
}

// Dropdown body: connection status + the recent-event list. Rendered inside the bell popover.
const NotificationPanel: React.FC<Props> = ({ onClose }) => {
  const { t } = useTranslation();
  const { events, lastReadAt, connected } = useNotificationFeed();
  const readMs = lastReadAt ? Date.parse(lastReadAt) : 0;

  return (
    <div className="w-[22rem] max-w-[calc(100vw-1.5rem)] max-h-[70vh] flex flex-col rounded-xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{t('notifications.title')}</span>
          {connected ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-green-600" title={t('notifications.live')}>
              <Wifi className="w-3.5 h-3.5" /> {t('notifications.live')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400" title={t('notifications.reconnecting')}>
              <WifiOff className="w-3.5 h-3.5" /> {t('login2.connectivityOffline')}
            </span>
          )}
        </div>
        <AdminActionButton
          variant="ghost"
          label={t('common.close')}
          onClick={onClose}
          className="text-xs"
        />
      </div>

      <div className="overflow-y-auto">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-gray-400">
            <BellOff className="w-6 h-6" />
            <span className="text-sm">{t('notifications.empty')}</span>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {events.map((e) => {
              const meta = notificationMeta(e.event_type);
              const Icon = meta.icon;
              const sev = SEVERITY_STYLES[e.severity] ?? SEVERITY_STYLES.info;
              const desc = notificationDescription(e);
              const unread = Date.parse(e.created_at) > readMs;
              return (
                <li
                  key={e.id}
                  className={`flex gap-3 px-4 py-3 ${unread ? 'bg-blue-50/40' : 'bg-white'}`}
                >
                  <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ring-4 ${sev.ring} ${sev.text}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sev.dot}`} />
                      <span className="text-sm font-medium text-gray-900 truncate">{meta.title}</span>
                      <span className="ml-auto text-[11px] text-gray-400 flex-shrink-0 whitespace-nowrap">
                        {relativeTime(e.created_at)}
                      </span>
                    </div>
                    {desc && <p className="text-xs text-gray-500 mt-0.5 break-words">{desc}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default NotificationPanel;
