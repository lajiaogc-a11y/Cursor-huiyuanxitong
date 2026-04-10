/**
 * 会话列表 — Step 11 增强版
 *
 * 新增：
 *   - 状态筛选标签（全部 / 未读 / 已读未回 / 待跟进 / 优先）
 *   - 搜索增强（手机号 + 联系人名 + 最后消息）
 *   - 统计条显示当前筛选结果计数
 *   - React.memo 优化渲染
 */
import { useState, useMemo, memo } from 'react';
import { Search, MessageCircle, Filter } from 'lucide-react';
import { ConversationItem } from './ConversationItem';
import { STATUS_META, type ConversationStatus } from '@/services/whatsapp/conversationStatusService';
import type { WaConversation } from '@/services/whatsapp/localSessionBridgeService';
import { cn } from '@/lib/utils';

interface Props {
  conversations: WaConversation[];
  activePhone: string | null;
  onSelect: (phone: string) => void;
}

type FilterTab = 'all' | ConversationStatus;

const FILTER_TABS: { key: FilterTab; label: string; dotColor?: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'unread', label: '未读', dotColor: 'bg-blue-400' },
  { key: 'read_no_reply', label: '待回', dotColor: 'bg-orange-400' },
  { key: 'follow_up_required', label: '跟进', dotColor: 'bg-yellow-400' },
  { key: 'priority', label: '优先', dotColor: 'bg-red-400' },
];

function ConversationListInner({ conversations, activePhone, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterTab>('all');

  const filtered = useMemo(() => {
    let list = conversations;

    if (statusFilter !== 'all') {
      list = list.filter(c => c.status === statusFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        c => c.name.toLowerCase().includes(q)
          || c.phone.includes(q)
          || c.lastMessage.toLowerCase().includes(q),
      );
    }

    return list;
  }, [conversations, search, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: conversations.length };
    for (const c of conversations) {
      counts[c.status] = (counts[c.status] ?? 0) + 1;
    }
    return counts;
  }, [conversations]);

  return (
    <div className="w-64 flex-shrink-0 border-r flex flex-col bg-background">
      {/* 搜索栏 */}
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            id="wa-conv-search"
            name="conversationSearch"
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索手机号/姓名/消息..."
            className="w-full h-8 pl-8 pr-3 rounded-md border bg-muted/30 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
      </div>

      {/* 状态筛选标签 */}
      <div className="px-1.5 py-1.5 border-b flex items-center gap-0.5 overflow-x-auto">
        <Filter className="w-3 h-3 text-muted-foreground flex-shrink-0 ml-1" />
        {FILTER_TABS.map(tab => {
          const count = statusCounts[tab.key] ?? 0;
          const isActive = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-full text-[10px] whitespace-nowrap transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-muted-foreground',
              )}
            >
              {tab.dotColor && <span className={cn('w-1.5 h-1.5 rounded-full', tab.dotColor)} />}
              {tab.label}
              {count > 0 && <span className="opacity-70">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* 统计条 */}
      <div className="px-3 py-1 border-b flex items-center gap-2 text-[10px] text-muted-foreground">
        <MessageCircle className="w-3 h-3" />
        <span>
          {statusFilter === 'all'
            ? `共 ${filtered.length} 会话`
            : `${STATUS_META[statusFilter as ConversationStatus]?.zh ?? statusFilter}: ${filtered.length}`}
        </span>
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="text-center text-muted-foreground text-xs py-8">
            {search.trim() ? '未找到匹配会话' : statusFilter !== 'all' ? '该分类暂无会话' : '暂无会话'}
          </div>
        )}
        {filtered.map(c => (
          <ConversationItem
            key={c.id}
            item={c}
            isActive={activePhone === c.phone}
            onClick={() => onSelect(c.phone)}
          />
        ))}
      </div>
    </div>
  );
}

export const ConversationList = memo(ConversationListInner);
