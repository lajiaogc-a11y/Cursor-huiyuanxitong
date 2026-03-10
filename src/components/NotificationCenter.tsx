import { useState } from 'react';
import { Bell, Check, CheckCheck, Trash2, Info, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications, type Notification } from '@/hooks/useNotifications';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { zhCN, enUS } from 'date-fns/locale';

const typeIcons: Record<string, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle,
  error: XCircle,
};

const typeColors: Record<string, string> = {
  info: 'text-blue-500',
  warning: 'text-amber-500',
  success: 'text-emerald-500',
  error: 'text-destructive',
};

function NotificationItem({
  notification,
  onRead,
  onDelete,
  onClick,
  language,
}: {
  notification: Notification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
  onClick: (n: Notification) => void;
  language: string;
}) {
  const Icon = typeIcons[notification.type] || Info;
  const colorClass = typeColors[notification.type] || 'text-muted-foreground';
  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
    locale: language === 'zh' ? zhCN : enUS,
  });

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 border-b border-border/50 hover:bg-accent/50 cursor-pointer transition-colors',
        !notification.is_read && 'bg-primary/5'
      )}
      onClick={() => onClick(notification)}
    >
      <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', colorClass)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('text-sm font-medium truncate', !notification.is_read && 'text-foreground')}>
            {notification.title}
          </span>
          {!notification.is_read && (
            <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.message}</p>
        <span className="text-[11px] text-muted-foreground/70 mt-1 block">{timeAgo}</span>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        {!notification.is_read && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => { e.stopPropagation(); onRead(notification.id); }}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={(e) => { e.stopPropagation(); onDelete(notification.id); }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function NotificationCenter() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleClick = (n: Notification) => {
    if (!n.is_read) markAsRead(n.id);
    if (n.link) {
      navigate(n.link);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 w-9 p-0 relative hover:bg-accent">
          <Bell className="h-4 w-4 text-muted-foreground" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-[18px] min-w-[18px] px-1 text-[10px] flex items-center justify-center rounded-full"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="end" sideOffset={8}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">{t('通知中心', 'Notifications')}</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => markAllAsRead()}>
              <CheckCheck className="h-3.5 w-3.5" />
              {t('全部已读', 'Mark all read')}
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[400px]">
          {notifications.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {t('暂无通知', 'No notifications')}
            </div>
          ) : (
            notifications.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onRead={markAsRead}
                onDelete={deleteNotification}
                onClick={handleClick}
                language={language}
              />
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
