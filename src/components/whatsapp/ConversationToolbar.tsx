import { useState } from 'react';
import { Tag, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ALL_STATUSES,
  STATUS_LABELS,
  type ConversationStatus,
} from '@/services/whatsapp/conversationStatusService';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  currentStatus: ConversationStatus | null;
  onStatusChange: (status: ConversationStatus) => void;
}

export function ConversationToolbar({ currentStatus, onStatusChange }: Props) {
  const [open, setOpen] = useState(false);
  const { language } = useLanguage();

  return (
    <div className="h-10 border-b flex items-center px-3 gap-2 bg-background flex-shrink-0">
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-muted transition-colors"
        >
          <Tag className="w-3.5 h-3.5" />
          <span>{currentStatus ? (language === 'zh' ? STATUS_LABELS[currentStatus].zh : STATUS_LABELS[currentStatus].en) : '设置状态'}</span>
        </button>
        {open && (
          <div className="absolute left-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-md py-1 min-w-[140px]">
            {ALL_STATUSES.map(s => (
              <button
                key={s}
                onClick={() => { onStatusChange(s); setOpen(false); }}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2',
                  currentStatus === s && 'bg-muted',
                )}
              >
                <span className={cn('w-2 h-2 rounded-full', STATUS_LABELS[s].color)} />
                {language === 'zh' ? STATUS_LABELS[s].zh : STATUS_LABELS[s].en}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
