/**
 * WhatsApp 账号列表
 * 左侧竖栏 — 含明显的「添加账号」入口
 */
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Plus, Wifi, WifiOff } from 'lucide-react';
import type { WaSession, AccountStats } from '@/services/whatsapp/localSessionBridgeService';

export type { WaSession };

interface Props {
  accounts: WaSession[];
  selectedId: string | null;
  onSelect: (accountId: string) => void;
  onAddAccount?: () => void;
  stats?: Record<string, AccountStats>;
}

function AccountListInner({ accounts, selectedId, onSelect, onAddAccount, stats }: Props) {
  return (
    <div className="w-16 flex-shrink-0 border-r bg-muted/30 flex flex-col items-center py-2 overflow-y-auto">

      {/* 顶部"+"按钮 — 始终可见 */}
      {onAddAccount && (
        <button
          onClick={onAddAccount}
          title="添加 WhatsApp 账号（扫码登录）"
          className="w-11 h-11 rounded-full bg-primary/10 border-2 border-primary/40 flex items-center justify-center text-primary hover:bg-primary/20 hover:border-primary/70 transition-all mb-2 flex-shrink-0"
        >
          <Plus className="w-5 h-5" />
        </button>
      )}

      {/* 分割线 */}
      {accounts.length > 0 && (
        <div className="w-8 border-t border-border/50 mb-2" />
      )}

      {/* 账号列表 */}
      <div className="flex flex-col items-center gap-1.5 flex-1 w-full px-1">
        {accounts.map((a) => {
          const s = stats?.[a.accountId];
          const totalBadge = (s?.unreadCount ?? 0) + (s?.readNoReplyCount ?? 0);

          return (
            <button
              key={a.id}
              onClick={() => onSelect(a.accountId)}
              title={`${a.name}\n未读: ${s?.unreadCount ?? 0}  已读未回: ${s?.readNoReplyCount ?? 0}`}
              className={cn(
                'w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold transition-colors relative flex-shrink-0',
                selectedId === a.accountId
                  ? 'bg-primary text-primary-foreground ring-2 ring-primary/50'
                  : 'bg-muted hover:bg-muted-foreground/20 text-muted-foreground',
              )}
            >
              {(a.name || '?').charAt(0)}

              {/* 连接状态点 */}
              <span className={cn(
                'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background flex items-center justify-center',
                a.isConnected ? 'bg-green-500' : 'bg-gray-400',
              )}>
                {a.isConnected
                  ? <Wifi className="w-1.5 h-1.5 text-white" />
                  : <WifiOff className="w-1.5 h-1.5 text-white" />
                }
              </span>

              {/* 消息 badge */}
              {totalBadge > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-red-500 text-[9px] text-white flex items-center justify-center px-0.5 font-normal leading-none">
                  {totalBadge > 99 ? '99+' : totalBadge}
                </span>
              )}

              {/* 已读未回橙点 */}
              {(s?.readNoReplyCount ?? 0) > 0 && totalBadge === 0 && (
                <span className="absolute -top-0.5 -left-0.5 w-2.5 h-2.5 rounded-full bg-orange-500 border border-background" />
              )}
            </button>
          );
        })}
      </div>

      {/* 空状态：无账号时 */}
      {accounts.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-muted-foreground text-[9px] text-center px-1">
            <WifiOff className="w-4 h-4 mx-auto mb-1 opacity-40" />
            <span className="opacity-60">暂无<br/>账号</span>
          </div>
        </div>
      )}
    </div>
  );
}

export const AccountList = memo(AccountListInner);
