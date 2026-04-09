import { cn } from '@/lib/utils';
import { ConversationStatusBadge } from './ConversationStatusBadge';
import type { WaConversation } from '@/services/whatsapp/localSessionBridgeService';
import type { ConversationStatus } from '@/services/whatsapp/conversationStatusService';

interface Props {
  conversation: WaConversation;
  isActive: boolean;
  status?: ConversationStatus | null;
  onClick: () => void;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
  return `${Math.floor(diff / 86_400_000)}天前`;
}

export function ConversationItem({ conversation, isActive, status, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-muted/50 transition-colors flex gap-2.5',
        isActive && 'bg-primary/10 border-l-2 border-l-primary',
      )}
    >
      <div className="w-9 h-9 rounded-full bg-muted flex-shrink-0 flex items-center justify-center text-sm font-medium">
        {conversation.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-sm font-medium truncate">{conversation.name}</span>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
            {formatRelativeTime(conversation.lastMessageAt)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <span className="text-xs text-muted-foreground truncate">{conversation.lastMessage}</span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {status && <ConversationStatusBadge status={status} />}
            {conversation.unreadCount > 0 && (
              <span className="w-4.5 h-4.5 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center">
                {conversation.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
