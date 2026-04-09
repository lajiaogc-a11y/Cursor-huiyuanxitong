import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { ConversationItem } from './ConversationItem';
import type { WaConversation } from '@/services/whatsapp/localSessionBridgeService';
import type { ConversationStatusRow } from '@/services/whatsapp/conversationStatusService';

interface Props {
  conversations: WaConversation[];
  statusMap: Map<string, ConversationStatusRow>;
  activePhone: string | null;
  onSelect: (phone: string) => void;
}

export function ConversationList({ conversations, statusMap, activePhone, onSelect }: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(
      c => c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.lastMessage.toLowerCase().includes(q),
    );
  }, [conversations, search]);

  return (
    <div className="w-64 flex-shrink-0 border-r flex flex-col bg-background">
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索联系人..."
            className="w-full h-8 pl-8 pr-3 rounded-md border bg-muted/30 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="text-center text-muted-foreground text-xs py-8">暂无会话</div>
        )}
        {filtered.map(c => (
          <ConversationItem
            key={c.id}
            conversation={c}
            isActive={activePhone === c.phone}
            status={statusMap.get(c.phone)?.status}
            onClick={() => onSelect(c.phone)}
          />
        ))}
      </div>
    </div>
  );
}
