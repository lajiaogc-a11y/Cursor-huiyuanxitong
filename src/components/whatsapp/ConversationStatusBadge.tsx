/**
 * 会话状态标签 — Step 11 React.memo 优化
 */
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { STATUS_META, type ConversationStatus } from '@/services/whatsapp/conversationStatusService';

export type { ConversationStatus };

interface Props {
  status: ConversationStatus;
  className?: string;
}

function ConversationStatusBadgeInner({ status, className }: Props) {
  const meta = STATUS_META[status];
  if (!meta) return null;
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white whitespace-nowrap',
      meta.color,
      className,
    )}>
      {meta.zh}
    </span>
  );
}

export const ConversationStatusBadge = memo(ConversationStatusBadgeInner);
