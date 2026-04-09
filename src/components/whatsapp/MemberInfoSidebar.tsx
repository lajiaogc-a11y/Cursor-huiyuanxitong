import { User, Phone, Star, Package, CreditCard, Clock } from 'lucide-react';
import { ConversationStatusBadge } from './ConversationStatusBadge';
import { FollowUpPanel } from './FollowUpPanel';
import type { ConversationContext } from '@/services/whatsapp/conversationContextService';
import type { ConversationNoteRow, ConversationStatus } from '@/services/whatsapp/conversationStatusService';

interface Props {
  context: ConversationContext | null;
  phone: string;
  status: ConversationStatus | null;
  notes: ConversationNoteRow[];
  onAddNote: (text: string) => void;
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

export function MemberInfoSidebar({ context, phone, status, notes, onAddNote, loading }: Props) {
  const member = context?.member;
  const activity = context?.activity;
  const orders = context?.recentOrders ?? [];

  return (
    <div className="w-72 flex-shrink-0 border-l bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <User className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            {member ? (
              <>
                <div className="text-sm font-medium truncate">
                  {String(member.nickname || member.member_code || phone)}
                </div>
                <div className="text-[10px] text-muted-foreground">{String(member.phone_number || phone)}</div>
              </>
            ) : (
              <>
                <div className="text-sm font-medium">{phone}</div>
                <div className="text-[10px] text-muted-foreground">未匹配会员</div>
              </>
            )}
          </div>
          {status && <ConversationStatusBadge status={status} />}
        </div>
      </div>

      {/* Member info */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center text-muted-foreground text-xs py-8">加载中...</div>
        ) : member ? (
          <div className="px-3 py-2 space-y-0.5">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">会员信息</div>
            <InfoRow icon={User} label="会员编号" value={String(member.member_code || '-')} />
            <InfoRow icon={Star} label="会员等级" value={String(member.member_level ?? '-')} />
            <InfoRow icon={Phone} label="手机号" value={String(member.phone_number || '-')} />
            {activity && (
              <>
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mt-3 mb-1">活动数据</div>
                <InfoRow icon={CreditCard} label="剩余积分" value={String(activity.remaining_points ?? 0)} />
                <InfoRow icon={Package} label="订单数" value={String(activity.order_count ?? 0)} />
              </>
            )}
            {orders.length > 0 && (
              <>
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mt-3 mb-1">最近订单</div>
                {orders.slice(0, 5).map((o, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 text-xs">
                    <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{String(o.order_number || o.id)}</span>
                    <span className="text-muted-foreground flex-shrink-0">{String(o.amount)}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        ) : (
          <div className="text-center text-muted-foreground text-xs py-8">
            <User className="w-8 h-8 mx-auto mb-2 opacity-30" />
            选择联系人后显示会员信息
          </div>
        )}
      </div>

      <FollowUpPanel notes={notes} onAddNote={onAddNote} loading={loading} />
    </div>
  );
}
