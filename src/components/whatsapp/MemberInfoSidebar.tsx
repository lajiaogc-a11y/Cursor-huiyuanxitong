/**
 * 右侧会员信息栏 — Step 10 增强版
 *
 * 新增：
 *   - 候选人列表（multiple_matches 时展示，点击确认绑定）
 *   - 搜索绑定（not_found 时展示搜索框，选择后绑定）
 *   - 已绑定指示 + 解绑操作
 *   - matchSource 显示（binding / exact / suffix）
 *
 * 所有逻辑在 service / API 层处理，本组件只展示结果和触发回调
 */
import { useState, useCallback, memo } from 'react';
import { User, Phone, Star, CreditCard, Package, Clock, Loader2, Search, Link, Unlink, ChevronRight } from 'lucide-react';
import { ConversationStatusBadge } from './ConversationStatusBadge';
import { FollowUpPanel } from './FollowUpPanel';
import type { ConversationContext, OrderSummary } from '@/services/whatsapp/conversationContextService';
import type { ConversationNote, ConversationStatus } from '@/services/whatsapp/conversationStatusService';
import { searchMembers, type MemberSummary } from '@/services/whatsapp/memberMatchService';

interface Props {
  context: ConversationContext | null;
  phone: string;
  status: ConversationStatus | null;
  notes: ConversationNote[];
  onAddNote: (text: string) => void;
  onBindMember?: (memberId: string) => void;
  onUnbindMember?: () => void;
  onSelectCandidate?: (memberId: string) => void;
  loading?: boolean;
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className="text-xs">{value}</div>
      </div>
    </div>
  );
}

function OrderRow({ order }: { order: OrderSummary }) {
  return (
    <div className="flex items-center gap-2 py-1 text-xs">
      <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
      <span className="truncate">{order.orderNumber}</span>
      <span className="text-muted-foreground flex-shrink-0">{order.amount}</span>
    </div>
  );
}

function MatchSourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  const labels: Record<string, string> = {
    binding: '手动绑定',
    exact: '精确匹配',
    suffix: '尾号匹配',
  };
  const colors: Record<string, string> = {
    binding: 'bg-green-100 text-green-700',
    exact: 'bg-blue-100 text-blue-700',
    suffix: 'bg-yellow-100 text-yellow-700',
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${colors[source] ?? 'bg-gray-100 text-gray-600'}`}>
      {labels[source] ?? source}
    </span>
  );
}

function CandidateItem({ m, onSelect }: { m: MemberSummary; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-accent text-left transition-colors"
    >
      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
        <User className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium truncate">{m.name || m.memberCode}</div>
        <div className="text-[10px] text-muted-foreground">{m.phone} · {m.level}</div>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
    </button>
  );
}

function MemberSearchPanel({ onSelect }: { onSelect: (memberId: string) => void }) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<MemberSummary[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = useCallback(async () => {
    if (keyword.trim().length < 2) return;
    setSearching(true);
    try {
      const data = await searchMembers(keyword.trim());
      setResults(data);
    } finally {
      setSearching(false);
    }
  }, [keyword]);

  return (
    <div className="px-3 py-2 space-y-2">
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">搜索并绑定会员</div>
      <div className="flex gap-1.5">
        <input
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="手机号/姓名/会员编号"
          className="flex-1 text-xs px-2 py-1.5 border rounded-md bg-background min-w-0"
        />
        <button
          onClick={handleSearch}
          disabled={searching || keyword.trim().length < 2}
          className="px-2 py-1.5 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50 flex-shrink-0"
        >
          {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
        </button>
      </div>
      {results.length > 0 && (
        <div className="space-y-0.5 max-h-40 overflow-y-auto">
          {results.map(m => (
            <CandidateItem key={m.id} m={m} onSelect={() => onSelect(m.id)} />
          ))}
        </div>
      )}
      {results.length === 0 && keyword.length >= 2 && !searching && (
        <div className="text-[10px] text-muted-foreground text-center py-2">未找到匹配会员</div>
      )}
    </div>
  );
}

function MemberInfoSidebarInner({ context, phone, status, notes, onAddNote, onBindMember, onUnbindMember, onSelectCandidate, loading }: Props) {
  const member = context?.memberSummary ?? null;
  const matchStatus = context?.matchStatus ?? null;
  const matchSource = context?.matchSource;
  const candidates = context?.candidates;
  const [showSearch, setShowSearch] = useState(false);

  const handleBind = useCallback((memberId: string) => {
    if (onBindMember) onBindMember(memberId);
    setShowSearch(false);
  }, [onBindMember]);

  const handleSelectCandidate = useCallback((memberId: string) => {
    if (onSelectCandidate) onSelectCandidate(memberId);
  }, [onSelectCandidate]);

  return (
    <div className="w-72 flex-shrink-0 border-l bg-background flex flex-col overflow-hidden">
      {/* 头部 */}
      <div className="p-3 border-b">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            {loading ? <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /> : <User className="w-5 h-5 text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1">
            {member ? (
              <>
                <div className="text-sm font-medium truncate">{member.name || member.memberCode}</div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">{member.phone}</span>
                  <MatchSourceBadge source={matchSource} />
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-medium">{phone || '—'}</div>
                <div className="text-[10px] text-muted-foreground">
                  {loading ? '匹配中...'
                    : matchStatus === 'multiple_matches' ? '匹配到多个会员'
                    : matchStatus === 'error' ? '匹配出错'
                    : phone ? '未匹配会员'
                    : '选择联系人'}
                </div>
              </>
            )}
          </div>
          {status && <ConversationStatusBadge status={status} />}
        </div>

        {/* 绑定/解绑操作 */}
        {member && matchSource === 'binding' && onUnbindMember && (
          <button
            onClick={onUnbindMember}
            className="mt-2 w-full flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground hover:text-destructive py-1 rounded border border-dashed transition-colors"
          >
            <Unlink className="w-3 h-3" /> 解除绑定
          </button>
        )}
      </div>

      {/* 会员详情 / 候选人列表 / 搜索绑定 */}
      <div className="flex-1 overflow-y-auto">
        {member && context ? (
          <div className="px-3 py-2 space-y-0.5">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">会员信息</div>
            <InfoRow icon={User} label="会员编号" value={member.memberCode} />
            <InfoRow icon={Star} label="会员等级" value={member.level} />
            <InfoRow icon={Phone} label="手机号" value={member.phone} />

            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mt-3 mb-1">活动数据</div>
            <InfoRow icon={CreditCard} label="剩余积分" value={context.pointsSummary ? String(context.pointsSummary.remaining) : '—'} />
            <InfoRow icon={Package} label="订单数" value={String(member.orderCount)} />

            {context.giftCardSummary && (
              <InfoRow icon={CreditCard} label="有效礼品卡" value={String(context.giftCardSummary.activeCards)} />
            )}

            {context.recentOrders.length > 0 && (
              <>
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mt-3 mb-1">最近订单</div>
                {context.recentOrders.map(o => <OrderRow key={o.id} order={o} />)}
              </>
            )}
          </div>
        ) : matchStatus === 'multiple_matches' && candidates && candidates.length > 0 ? (
          <div className="px-3 py-2">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
              匹配到 {candidates.length} 个会员，请选择
            </div>
            <div className="space-y-0.5">
              {candidates.map(c => (
                <CandidateItem
                  key={c.id}
                  m={c}
                  onSelect={() => handleSelectCandidate(c.id)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center text-muted-foreground text-xs py-6">
            <User className="w-8 h-8 mx-auto mb-2 opacity-30" />
            {loading ? '加载中...'
              : matchStatus === 'error' ? '会员匹配出错，请稍后重试'
              : phone ? '未找到会员资料'
              : '选择联系人后显示会员信息'}

            {phone && !loading && matchStatus !== 'error' && matchStatus !== 'multiple_matches' && onBindMember && (
              <div className="mt-3">
                {showSearch ? (
                  <MemberSearchPanel onSelect={handleBind} />
                ) : (
                  <button
                    onClick={() => setShowSearch(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    <Link className="w-3.5 h-3.5" /> 搜索并绑定会员
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <FollowUpPanel notes={notes} onAddNote={onAddNote} />
    </div>
  );
}

export const MemberInfoSidebar = memo(MemberInfoSidebarInner);
