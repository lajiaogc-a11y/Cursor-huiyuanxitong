import { cn } from '@/lib/utils';
import { STATUS_LABELS, type ConversationStatus } from '@/services/whatsapp/conversationStatusService';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  status: ConversationStatus;
  className?: string;
}

export function ConversationStatusBadge({ status, className }: Props) {
  const { language } = useLanguage();
  const meta = STATUS_LABELS[status];
  if (!meta) return null;
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white whitespace-nowrap',
      meta.color,
      className,
    )}>
      {language === 'zh' ? meta.zh : meta.en}
    </span>
  );
}
