import { cn } from '@/lib/utils';
import { Wifi, WifiOff } from 'lucide-react';
import type { WaSession } from '@/services/whatsapp/localSessionBridgeService';

interface Props {
  sessions: WaSession[];
  selectedAccountId: string | null;
  onSelect: (accountId: string) => void;
}

export function AccountList({ sessions, selectedAccountId, onSelect }: Props) {
  return (
    <div className="w-16 flex-shrink-0 border-r bg-muted/30 flex flex-col items-center gap-1 py-2 overflow-y-auto">
      {sessions.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.accountId)}
          title={s.name}
          className={cn(
            'w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold transition-colors relative',
            selectedAccountId === s.accountId
              ? 'bg-primary text-primary-foreground ring-2 ring-primary/50'
              : 'bg-muted hover:bg-muted-foreground/20 text-muted-foreground',
          )}
        >
          {s.name.charAt(0)}
          <span className={cn(
            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background',
            s.isConnected ? 'bg-green-500' : 'bg-gray-400',
          )} />
        </button>
      ))}
      {sessions.length === 0 && (
        <div className="text-muted-foreground text-[10px] text-center px-1 mt-4">
          <WifiOff className="w-4 h-4 mx-auto mb-1" />
          暂无账号
        </div>
      )}
    </div>
  );
}
