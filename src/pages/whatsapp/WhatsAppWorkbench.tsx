/**
 * WhatsApp 工作台
 *
 * P1 变更：
 *   1. 统一全局轮询：accounts + conversations + stats + messages 一个 interval
 *   2. 状态双轨收口：bridge 为 source-of-truth，local optimistic store 只做短暂缓冲
 *   3. 登录成功后全量刷新 accounts + stats
 *   4. companion 断开检测纳入轮询
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare, Loader2, WifiOff, RefreshCw, Plus, Monitor } from 'lucide-react';

import { AccountList } from '@/components/whatsapp/AccountList';
import { ConversationList } from '@/components/whatsapp/ConversationList';
import { MessagePane } from '@/components/whatsapp/MessagePane';
import { MemberInfoSidebar } from '@/components/whatsapp/MemberInfoSidebar';
import { ConversationToolbar } from '@/components/whatsapp/ConversationToolbar';
import { AddAccountDialog } from '@/components/whatsapp/AddAccountDialog';

import * as bridge from '@/services/whatsapp/localSessionBridgeService';
import { CompanionOfflineError } from '@/services/whatsapp/localSessionBridgeService';
import * as statusSvc from '@/services/whatsapp/conversationStatusService';
import { isRunningInElectron } from '@/api/localWhatsappBridge';
import { loadConversationContext, persistNote, type ConversationContext } from '@/services/whatsapp/conversationContextService';
import { bindMemberToPhone, unbindMember, invalidateMatchCache } from '@/services/whatsapp/memberMatchService';
import type { WaSession, WaConversation, WaMessage, AccountStats } from '@/services/whatsapp/localSessionBridgeService';
import type { ConversationStatus, ConversationNote } from '@/services/whatsapp/conversationStatusService';

type WorkbenchState = 'loading' | 'ready' | 'companion_offline' | 'error';

const POLL_MS = 4_000;

export default function WhatsAppWorkbench() {
  const [workbenchState, setWorkbenchState] = useState<WorkbenchState>('loading');
  const [companionMode, setCompanionMode] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<WaSession[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [conversations, setConversations] = useState<WaConversation[]>([]);
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [context, setContext] = useState<ConversationContext | null>(null);
  const [currentStatus, setCurrentStatus] = useState<ConversationStatus | null>(null);
  const [notes, setNotes] = useState<ConversationNote[]>([]);
  const [allStats, setAllStats] = useState<Record<string, AccountStats>>({});

  const [loadingContext, setLoadingContext] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const selectedAccountRef = useRef(selectedAccountId);
  selectedAccountRef.current = selectedAccountId;
  const activePhoneRef = useRef(activePhone);
  activePhoneRef.current = activePhone;

  // ══════════════════════════════════════════════════
  //  P1-1: 统一全局轮询
  //
  //  单个 setInterval 同时刷新：
  //    - accounts  (会话连接状态变化)
  //    - conversations (新消息/状态变化)
  //    - stats (未读数/已读未回计数)
  //    - messages (当前打开会话的消息)
  //
  //  好处：所有面板同步刷新，不存在某个面板看到过时数据
  // ══════════════════════════════════════════════════

  const globalRefresh = useCallback(async () => {
    const acctId = selectedAccountRef.current;
    const phone = activePhoneRef.current;

    try {
      // 并行刷新 accounts + stats + conversations + messages
      const promises: Promise<unknown>[] = [];

      // accounts
      const sessionsPromise = bridge.getSessions();
      promises.push(sessionsPromise);

      // stats for all accounts
      const statsPromise = bridge.getAllAccountStats();
      promises.push(statsPromise);

      // conversations for selected account
      let convsPromise: Promise<WaConversation[]> | null = null;
      if (acctId) {
        convsPromise = bridge.getConversations(acctId);
        promises.push(convsPromise);
      }

      // messages for active conversation
      let msgsPromise: Promise<WaMessage[]> | null = null;
      if (acctId && phone) {
        msgsPromise = bridge.getMessages(acctId, phone);
        promises.push(msgsPromise);
      }

      await Promise.allSettled(promises);

      // Apply results only if selection hasn't changed
      try {
        const sessions = await sessionsPromise;
        setAccounts(sessions);
      } catch { /* handled below */ }

      try {
        const stats = await statsPromise;
        setAllStats(stats);
      } catch { /* non-critical */ }

      if (convsPromise && selectedAccountRef.current === acctId) {
        try {
          const convs = await convsPromise;
          setConversations(convs);
          // P1-2: 同步 bridge 状态到 local store + UI 状态
          if (phone) {
            const freshConv = convs.find(c => c.phone === phone);
            if (freshConv && activePhoneRef.current === phone) {
              statusSvc.updateStatus(acctId!, phone, freshConv.status);
              setCurrentStatus(freshConv.status);
            }
          }
        } catch { /* handled below */ }
      }

      if (msgsPromise && selectedAccountRef.current === acctId && activePhoneRef.current === phone) {
        try {
          const fresh = await msgsPromise;
          setMessages(prev => {
            const lastOld = prev[prev.length - 1]?.id;
            const lastNew = fresh[fresh.length - 1]?.id;
            if (lastOld === lastNew && prev.length === fresh.length) return prev;
            return fresh;
          });
        } catch { /* non-critical */ }
      }
    } catch (e) {
      if (e instanceof CompanionOfflineError) {
        setWorkbenchState('companion_offline');
      }
    }
  }, []);

  // ── 初始化 ──
  const initLoad = useCallback(async () => {
    setWorkbenchState('loading');
    try {
      const health = await bridge.checkCompanionHealth();
      if (!health.online) {
        setWorkbenchState('companion_offline');
        setCompanionMode(null);
        return;
      }
      setCompanionMode(health.mode ?? null);

      const [sessions, stats] = await Promise.all([
        bridge.getSessions(),
        bridge.getAllAccountStats(),
      ]);
      setAccounts(sessions);
      setAllStats(stats);
      if (sessions.length > 0 && !selectedAccountRef.current) {
        setSelectedAccountId(sessions[0].accountId);
      }
      setWorkbenchState('ready');
    } catch (e) {
      if (e instanceof CompanionOfflineError) {
        setWorkbenchState('companion_offline');
      } else {
        setWorkbenchState('error');
      }
    }
  }, []);

  useEffect(() => { initLoad(); }, [initLoad]);

  // ── P1-1: 统一轮询 interval ──
  useEffect(() => {
    if (workbenchState !== 'ready') return;
    const timer = setInterval(globalRefresh, POLL_MS);
    return () => clearInterval(timer);
  }, [workbenchState, globalRefresh]);

  // ── 切换账号 ──
  useEffect(() => {
    if (!selectedAccountId || workbenchState !== 'ready') {
      setConversations([]);
      return;
    }
    let cancelled = false;
    bridge.getConversations(selectedAccountId).then(convs => {
      if (cancelled) return;
      setConversations(convs);
      setActivePhone(null);
      setMessages([]);
      setContext(null);
      setCurrentStatus(null);
      setNotes([]);
    }).catch((e) => {
      if (cancelled) return;
      if (e instanceof CompanionOfflineError) setWorkbenchState('companion_offline');
      else setConversations([]);
    });
    return () => { cancelled = true; };
  }, [selectedAccountId, workbenchState]);

  // ── 选择联系人 ──
  const handleSelectConversation = useCallback(async (phone: string) => {
    const acctId = selectedAccountRef.current;
    if (!acctId) return;

    setActivePhone(phone);
    setContext(null);
    setCurrentStatus(null);
    setNotes([]);
    setMessages([]);
    setLoadingContext(true);
    setLoadingMessages(true);

    try {
      await bridge.markAsRead(acctId, phone);
    } catch { /* non-critical */ }

    try {
      const [msgs, freshConvs, stats] = await Promise.all([
        bridge.getMessages(acctId, phone),
        bridge.getConversations(acctId),
        bridge.getAllAccountStats(),
      ]);

      if (selectedAccountRef.current !== acctId || activePhoneRef.current !== phone) return;

      setMessages(msgs);
      setLoadingMessages(false);
      setConversations(freshConvs);
      setAllStats(stats);

      // P1-2: bridge 状态为 source-of-truth
      const freshConv = freshConvs.find(c => c.phone === phone);
      const bridgeStatus = freshConv?.status ?? null;
      if (bridgeStatus) {
        statusSvc.updateStatus(acctId, phone, bridgeStatus);
        setCurrentStatus(bridgeStatus);
      }

      setNotes(statusSvc.listNotesForPhone(acctId, phone));
    } catch (e) {
      if (e instanceof CompanionOfflineError) setWorkbenchState('companion_offline');
      if (selectedAccountRef.current === acctId && activePhoneRef.current === phone) {
        setLoadingMessages(false);
      }
    }

    try {
      const ctx = await loadConversationContext(phone, acctId);
      if (selectedAccountRef.current !== acctId || activePhoneRef.current !== phone) return;
      setContext(ctx);
    } catch {
      /* context load failure is non-fatal */
    } finally {
      if (selectedAccountRef.current === acctId && activePhoneRef.current === phone) {
        setLoadingContext(false);
      }
    }
  }, []);

  // ── 发送消息 ──
  const handleSend = useCallback(async (text: string) => {
    const acctId = selectedAccountRef.current;
    const phone = activePhoneRef.current;
    if (!acctId || !phone) return;

    try {
      const msg = await bridge.sendMessage({ accountId: acctId, phone, body: text });
      setMessages(prev => [...prev, msg]);

      // 立刻刷新会话列表和统计，不等下一轮轮询
      const [freshConvs, stats] = await Promise.all([
        bridge.getConversations(acctId),
        bridge.getAllAccountStats(),
      ]);
      if (selectedAccountRef.current === acctId) {
        setConversations(freshConvs);
        setAllStats(stats);
      }

      const freshConv = freshConvs.find(c => c.phone === phone);
      if (freshConv && activePhoneRef.current === phone) {
        setCurrentStatus(freshConv.status);
        statusSvc.updateStatus(acctId, phone, freshConv.status);
      }
    } catch (e) {
      if (e instanceof CompanionOfflineError) setWorkbenchState('companion_offline');
      console.error('[WhatsApp] sendMessage failed:', e);
    }
  }, []);

  // ── P1-2: 手动切状态 — optimistic update + bridge 持久化 + 刷新 ──
  const handleStatusChange = useCallback(async (status: ConversationStatus) => {
    const acctId = selectedAccountRef.current;
    const phone = activePhoneRef.current;
    if (!acctId || !phone) return;

    // Optimistic: 立即更新 UI
    const prevStatus = currentStatus;
    statusSvc.updateStatus(acctId, phone, status);
    setCurrentStatus(status);

    try {
      // 持久化到 bridge (companion store)
      await bridge.updateConversationStatus(acctId, phone, status);
      // 刷新以确认持久化成功
      const [freshConvs, stats] = await Promise.all([
        bridge.getConversations(acctId),
        bridge.getAllAccountStats(),
      ]);
      if (selectedAccountRef.current === acctId) {
        setConversations(freshConvs);
        setAllStats(stats);
      }
    } catch (e) {
      // 失败回滚 optimistic update
      if (prevStatus !== null) {
        statusSvc.updateStatus(acctId, phone, prevStatus);
      }
      setCurrentStatus(prevStatus);
      if (e instanceof CompanionOfflineError) setWorkbenchState('companion_offline');
      console.error('[WhatsApp] updateStatus failed:', e);
    }
  }, [currentStatus]);

  // ── 添加备注 ──
  const handleAddNote = useCallback((text: string) => {
    const acctId = selectedAccountRef.current;
    const phone = activePhoneRef.current;
    if (!acctId || !phone) return;
    const localNote = statusSvc.addNote(acctId, phone, text);
    setNotes(prev => [localNote, ...prev]);
    persistNote(acctId, phone, text).catch(e => {
      console.error('[WhatsApp] persistNote failed:', e);
    });
  }, []);

  // ── 绑定/解绑会员 ──
  const refreshContext = useCallback(async () => {
    const acctId = selectedAccountRef.current;
    const phone = activePhoneRef.current;
    if (!acctId || !phone) return;
    invalidateMatchCache(phone);
    setLoadingContext(true);
    try {
      const ctx = await loadConversationContext(phone, acctId);
      if (selectedAccountRef.current === acctId && activePhoneRef.current === phone) {
        setContext(ctx);
      }
    } catch { /* non-fatal */ } finally {
      if (selectedAccountRef.current === acctId && activePhoneRef.current === phone) {
        setLoadingContext(false);
      }
    }
  }, []);

  const handleBindMember = useCallback(async (memberId: string) => {
    const acctId = selectedAccountRef.current;
    const phone = activePhoneRef.current;
    if (!acctId || !phone) return;
    try {
      await bindMemberToPhone(acctId, phone, memberId);
      await refreshContext();
    } catch (e) {
      console.error('[WhatsApp] bindMember failed:', e);
    }
  }, [refreshContext]);

  const handleUnbindMember = useCallback(async () => {
    const phone = activePhoneRef.current;
    if (!phone) return;
    try {
      await unbindMember(phone);
      await refreshContext();
    } catch (e) {
      console.error('[WhatsApp] unbindMember failed:', e);
    }
  }, [refreshContext]);

  const handleSelectCandidate = useCallback(async (memberId: string) => {
    const acctId = selectedAccountRef.current;
    const phone = activePhoneRef.current;
    if (!acctId || !phone) return;
    try {
      await bindMemberToPhone(acctId, phone, memberId);
      await refreshContext();
    } catch (e) {
      console.error('[WhatsApp] selectCandidate failed:', e);
    }
  }, [refreshContext]);

  // ── P1-3: 扫码成功 → 全量刷新 accounts + stats ──
  const handleAddAccountConnected = useCallback(async (newSessionId: string) => {
    try {
      const [sessions, stats] = await Promise.all([
        bridge.getSessions(),
        bridge.getAllAccountStats(),
      ]);
      setAccounts(sessions);
      setAllStats(stats);
      // 自动选中新账号
      if (newSessionId) {
        const newAccount = sessions.find(s => s.id === newSessionId || s.accountId === newSessionId);
        if (newAccount) {
          setSelectedAccountId(newAccount.accountId);
        }
      } else if (sessions.length > 0 && !selectedAccountRef.current) {
        setSelectedAccountId(sessions[0].accountId);
      }
    } catch (e) {
      if (e instanceof CompanionOfflineError) setWorkbenchState('companion_offline');
    }
  }, []);

  const activeConversation = conversations.find(c => c.phone === activePhone);

  // ── 加载中 ──
  if (workbenchState === 'loading') {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto mb-3" />
          <div className="text-sm text-muted-foreground">加载 WhatsApp 工作台...</div>
        </div>
      </div>
    );
  }

  // ── Companion 离线 ──
  if (workbenchState === 'companion_offline') {
    const inElectron = isRunningInElectron();
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <Monitor className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {inElectron ? 'Companion 正在初始化...' : 'WhatsApp Companion 未连接'}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {inElectron
              ? '本地 WhatsApp 服务正在启动，请稍候...'
              : '工作台需要本地 PC 客户端（WhatsApp Companion）才能运行。请确保已在本机启动 Companion 程序。'}
          </p>
          {!inElectron && (
            <div className="bg-muted/50 rounded-lg p-4 text-left text-xs text-muted-foreground mb-4 font-mono">
              <div className="mb-1">方式一：下载桌面客户端（推荐）</div>
              <div className="pl-2 mb-2">点击右上角下载按钮安装 PC 客户端，双击即可一键启动</div>
              <div className="mb-1">方式二：命令行启动</div>
              <div className="pl-2">cd electron</div>
              <div className="pl-2">npm install</div>
              <div className="pl-2">npx tsx start.ts</div>
            </div>
          )}
          <button
            onClick={initLoad}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> {inElectron ? '重试' : '重新检测'}
          </button>
        </div>
      </div>
    );
  }

  // ── 其他错误 ──
  if (workbenchState === 'error') {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center bg-background">
        <div className="text-center">
          <WifiOff className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
          <div className="text-sm text-muted-foreground mb-3">无法连接到会话服务</div>
          <button
            onClick={initLoad}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> 重试
          </button>
        </div>
      </div>
    );
  }

  // ── 正常工作台 ──
  const isDemo = companionMode?.toLowerCase().includes('demo');

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-background overflow-hidden">

      {isDemo && (
        <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 text-amber-800 text-xs">
          <span className="font-bold">⚠ 演示模式</span>
          <span>— Companion 以 USE_DEMO=1 启动，数据非真实 WhatsApp 会话。</span>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <AccountList
          accounts={accounts}
          selectedId={selectedAccountId}
          onSelect={setSelectedAccountId}
          onAddAccount={() => setAddDialogOpen(true)}
          stats={allStats}
        />

        <AddAccountDialog
          open={addDialogOpen}
          onClose={() => setAddDialogOpen(false)}
          onConnected={handleAddAccountConnected}
        />

        <ConversationList
          conversations={conversations}
          activePhone={activePhone}
          onSelect={handleSelectConversation}
        />

      {activePhone ? (
        <div className="flex-1 flex flex-col min-w-0">
          <ConversationToolbar
            currentStatus={currentStatus}
            onStatusChange={handleStatusChange}
            onQuickNote={handleAddNote}
            contactName={activeConversation?.name}
            contactPhone={activePhone}
          />
          {loadingMessages ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <MessagePane
              messages={messages}
              contactName={activeConversation?.name ?? activePhone}
              contactPhone={activePhone}
              onSend={handleSend}
            />
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-muted/10">
          <div className="text-center text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <div className="text-sm">
              {accounts.length === 0
                ? (
                  <div>
                    <div className="mb-2">尚未添加 WhatsApp 账号</div>
                    <button
                      onClick={() => setAddDialogOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#25D366] text-white text-xs font-medium hover:bg-[#1ebe5d] transition-colors"
                    >
                      <Plus className="w-3 h-3" /> 添加账号
                    </button>
                  </div>
                )
                : conversations.length === 0
                  ? '当前账号暂无会话'
                  : '选择联系人开始会话'}
            </div>
          </div>
        </div>
      )}

        <MemberInfoSidebar
          context={context}
          phone={activePhone ?? ''}
          status={currentStatus}
          notes={notes}
          onAddNote={handleAddNote}
          onBindMember={handleBindMember}
          onUnbindMember={handleUnbindMember}
          onSelectCandidate={handleSelectCandidate}
          loading={loadingContext}
        />
      </div>
    </div>
  );
}
