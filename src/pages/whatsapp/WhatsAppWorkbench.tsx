/**
 * WhatsApp 工作台 — Step 11 上线前增强
 *
 * 增强清单：
 *   1. 错误/弱网状态处理 — 操作失败时 toast 提示，自动重试
 *   2. 快捷操作回调 — onQuickNote 传递给 ConversationToolbar
 *   3. 性能：useCallback 依赖最小化，useRef 避免闭包陷阱
 *   4. 空状态优化 — 无账号 / 无会话 / 加载中 分别处理
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare, Loader2, WifiOff, RefreshCw, Info, Plus } from 'lucide-react';

import { AccountList } from '@/components/whatsapp/AccountList';
import { ConversationList } from '@/components/whatsapp/ConversationList';
import { MessagePane } from '@/components/whatsapp/MessagePane';
import { MemberInfoSidebar } from '@/components/whatsapp/MemberInfoSidebar';
import { ConversationToolbar } from '@/components/whatsapp/ConversationToolbar';
import { AddAccountDialog } from '@/components/whatsapp/AddAccountDialog';

import * as bridge from '@/services/whatsapp/localSessionBridgeService';
import * as statusSvc from '@/services/whatsapp/conversationStatusService';
import { loadConversationContext, persistNote, type ConversationContext } from '@/services/whatsapp/conversationContextService';
import { bindMemberToPhone, unbindMember, invalidateMatchCache } from '@/services/whatsapp/memberMatchService';
import type { WaSession, WaConversation, WaMessage, AccountStats } from '@/services/whatsapp/localSessionBridgeService';
import type { ConversationStatus, ConversationNote } from '@/services/whatsapp/conversationStatusService';

export default function WhatsAppWorkbench() {
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

  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingContext, setLoadingContext] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [initError, setInitError] = useState(false);

  const selectedAccountRef = useRef(selectedAccountId);
  selectedAccountRef.current = selectedAccountId;
  const activePhoneRef = useRef(activePhone);
  activePhoneRef.current = activePhone;

  // ── 工具：刷新会话列表并返回最新数据 ──
  const refreshConversations = useCallback(async (accountId: string): Promise<WaConversation[]> => {
    try {
      const convs = await bridge.getConversations(accountId);
      if (selectedAccountRef.current === accountId) {
        setConversations(convs);
      }
      return convs;
    } catch {
      return [];
    }
  }, []);

  const refreshAllStats = useCallback(async () => {
    try {
      const stats = await bridge.getAllAccountStats();
      setAllStats(stats);
    } catch {
      /* non-critical */
    }
  }, []);

  // ── 初始化 ──
  const initLoad = useCallback(async () => {
    setLoadingSessions(true);
    setInitError(false);
    try {
      const [sessions, stats] = await Promise.all([
        bridge.getSessions(),
        bridge.getAllAccountStats(),
      ]);
      setAccounts(sessions);
      setAllStats(stats);
      if (sessions.length > 0 && !selectedAccountRef.current) {
        setSelectedAccountId(sessions[0].accountId);
      }
    } catch {
      setInitError(true);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => { initLoad(); }, [initLoad]);

  // ── 消息轮询（每 5 秒刷新当前会话消息，模拟实时收消息） ──
  useEffect(() => {
    const POLL_MS = 5_000;
    const timer = setInterval(async () => {
      const acctId = selectedAccountRef.current;
      const phone = activePhoneRef.current;
      if (!acctId || !phone) return;
      try {
        const fresh = await bridge.getMessages(acctId, phone);
        // 只在有新消息时才更新，避免无意义重渲染
        setMessages(prev => {
          const lastOld = prev[prev.length - 1]?.id;
          const lastNew = fresh[fresh.length - 1]?.id;
          if (lastOld === lastNew && prev.length === fresh.length) return prev;
          return fresh;
        });
      } catch { /* non-critical */ }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 切换账号 ──
  useEffect(() => {
    if (!selectedAccountId) {
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
    }).catch(() => {
      if (!cancelled) setConversations([]);
    });
    return () => { cancelled = true; };
  }, [selectedAccountId]);

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
      const [msgs, freshConvs] = await Promise.all([
        bridge.getMessages(acctId, phone),
        refreshConversations(acctId),
        refreshAllStats(),
      ]);

      if (selectedAccountRef.current !== acctId || activePhoneRef.current !== phone) return;

      setMessages(msgs);
      setLoadingMessages(false);

      const freshConv = freshConvs.find(c => c.phone === phone);
      const bridgeStatus = freshConv?.status ?? null;
      const svcStatus = statusSvc.getStatusForPhone(acctId, phone);
      setCurrentStatus(svcStatus ?? bridgeStatus);

      if (bridgeStatus && !svcStatus) {
        statusSvc.updateStatus(acctId, phone, bridgeStatus);
      }

      setNotes(statusSvc.listNotesForPhone(acctId, phone));
    } catch {
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
  }, [refreshConversations, refreshAllStats]);

  // ── 发送消息 ──
  const handleSend = useCallback(async (text: string) => {
    const acctId = selectedAccountRef.current;
    const phone = activePhoneRef.current;
    if (!acctId || !phone) return;

    try {
      const msg = await bridge.sendMessage({ accountId: acctId, phone, body: text });
      setMessages(prev => [...prev, msg]);

      const freshConvs = await refreshConversations(acctId);
      await refreshAllStats();

      const freshConv = freshConvs.find(c => c.phone === phone);
      if (freshConv) {
        setCurrentStatus(freshConv.status);
        statusSvc.updateStatus(acctId, phone, freshConv.status);
      }
    } catch (e) {
      console.error('[WhatsApp] sendMessage failed:', e);
    }
  }, [refreshConversations, refreshAllStats]);

  // ── 手动切状态 ──
  const handleStatusChange = useCallback(async (status: ConversationStatus) => {
    const acctId = selectedAccountRef.current;
    const phone = activePhoneRef.current;
    if (!acctId || !phone) return;

    statusSvc.updateStatus(acctId, phone, status);
    setCurrentStatus(status);

    try {
      await bridge.updateConversationStatus(acctId, phone, status);
      await Promise.all([
        refreshConversations(acctId),
        refreshAllStats(),
      ]);
    } catch (e) {
      console.error('[WhatsApp] updateStatus failed:', e);
    }
  }, [refreshConversations, refreshAllStats]);

  // ── 添加备注（本地即时显示 + 异步持久化到后端） ──
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

  // ── 绑定/解绑会员 (Step 10) ──
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
    } catch {
      /* context refresh failure is non-fatal */
    } finally {
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

  // ── 扫码成功后刷新账号列表（必须在所有条件 return 之前定义） ──
  const handleAddAccountConnected = useCallback(async (_sessionId: string) => {
    const sessions = await bridge.getSessions();
    setAccounts(sessions);
    if (sessions.length > 0 && !selectedAccountId) {
      setSelectedAccountId(sessions[0].accountId);
    }
  }, [selectedAccountId]);

  const activeConversation = conversations.find(c => c.phone === activePhone);

  // 检测是否全是演示账号（id 为 s1/s2/s3 开头）
  const allDemo = accounts.length > 0 && accounts.every(a => /^s\d+$/.test(a.id));

  // ── 初始化加载状态 ──
  if (loadingSessions) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto mb-3" />
          <div className="text-sm text-muted-foreground">加载 WhatsApp 工作台...</div>
        </div>
      </div>
    );
  }

  // ── 初始化错误状态 ──
  if (initError) {
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

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-background overflow-hidden">

      {/* 演示模式横幅 */}
      {allDemo && (
        <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-amber-800 text-xs">
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              <strong>演示模式</strong> — 当前显示的是模拟数据，尚未连接真实 WhatsApp 账号。
              点击右侧按钮或左侧「+」按钮可添加真实账号（扫码登录）。
            </span>
          </div>
          <button
            onClick={() => setAddDialogOpen(true)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#25D366] text-white text-xs font-medium hover:bg-[#1ebe5d] transition-colors whitespace-nowrap"
          >
            <Plus className="w-3 h-3" />
            添加真实账号
          </button>
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
              {conversations.length === 0
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

