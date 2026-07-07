import React, { useState, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { useNotificationFeed } from '../../contexts/NotificationFeedContext';
import NotificationPanel from './NotificationPanel';

// Header bell for the PWA. Badge shows unread count; opening the panel marks everything
// read (persists the cursor to notification_read_state). PWA-host-gated by the caller.
const NotificationBell: React.FC = () => {
  const { unreadCount, markAllRead } = useNotificationFeed();
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next && unreadCount > 0) void markAllRead();
      return next;
    });
  }, [unreadCount, markAllRead]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        className="relative p-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
      >
        <Bell className="w-5 h-5 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] leading-none font-semibold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 mt-2 z-50">
            <NotificationPanel onClose={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationBell;
