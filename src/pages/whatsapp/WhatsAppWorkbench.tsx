/**
 * WhatsApp 工作台 — 主页面
 * Page 层：只消费 Service 输出，不含业务逻辑
 */
import { useState, useEffect, useCallback } from 'react';
import { MessageSquare } from 'lucide-react';

import { AccountList } from '@/components/whatsapp/AccountList';
import { ConversationList } from '@/components/whatsapp/ConversationList';
import { MessagePane } from '@/components/whatsapp/MessagePane';
import { MemberInfoSidebar } from '@/components/whatsapp/MemberInfoSidebar';
import { ConversationToolbar } from '@/components/whatsapp/ConversationToolbar';

import {
  getSessions,
  getConversations,
  getMessages,
  sendMessage,
  type WaSession,
  type WaConversation,
  type WaMessage,
} from '@/services/whatsapp/localSessionBridgeService';
import {
  loadConversationContext,
  type ConversationContext,
} from '@/services/whatsapp/conversationContextService';
import {
  updateConversationStatus,
  listConversationStatuses,
  addNote,
  listNotes,
  type ConversationStatus,
  type ConversationStatusRow,
  type ConversationNoteRow,
} from '@/services/whatsapp/conversationStatusService';

export default function WhatsAppWorkbench() {
  // ── 账号 ──
  const [sessions, setSessions] = useState<WaSession[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // ── 会话列表 ──
  const [conversations, setConversations] = useState<WaConversation[]>([]);
  const [statusMap, setStatusMap] = useState<Map<string, ConversationStatusRow>>(new Map());

  // ── 当前会话 ──
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // ── 会员上下文 ──
  const [context, setContext] = useState<ConversationContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [notes, setNotes] = useState<ConversationNoteRow[]>([]);
  const [currentStatus, setCurrentStatus] = useState<ConversationStatus | null>(null);

  // 加载账号列表
  useEffect(() => {
    getSessions().then(s => {
      setSessions(s);
      if (s.length > 0 && !selectedAccountId) setSelectedAccountId(s[0].accountId);
    });
  }, []);

  // 切换账号时加载会话列表 + 状态
  useEffect(() => {
    if (!selectedAccountId) return;
    getConversations(selectedAccountId).then(setConversations);
    listConversationStatuses(selectedAccountId).then(rows => {
      const map = new Map<string, ConversationStatusRow>();
      rows.forEach(r => map.set(r.phone_normalized || r.phone_raw, r));
      setStatusMap(map);
    });
  }, [selectedAccountId]);

  // 选择联系人时加载消息和上下文
  const handleSelectConversation = useCallback(async (phone: string) => {
    if (!selectedAccountId) return;
    setActivePhone(phone);

    setMessagesLoading(true);
    getMessages(selectedAccountId, phone)
      .then(setMessages)
      .finally(() => setMessagesLoading(false));

    setContextLoading(true);
    loadConversationContext(phone, selectedAccountId)
      .then(ctx => {
        setContext(ctx);
        setCurrentStatus(ctx.conversationStatus?.status ?? null);
      })
      .finally(() => setContextLoading(false));

    listNotes(selectedAccountId, phone).then(setNotes);
  }, [selectedAccountId]);

  // 发送消息
  const handleSend = useCallback(async (text: string) => {
    if (!selectedAccountId || !activePhone) return;
    const msg = await sendMessage(selectedAccountId, activePhone, text);
    setMessages(prev => [...prev, msg]);
  }, [selectedAccountId, activePhone]);

  // 更新会话状态
  const handleStatusChange = useCallback(async (status: ConversationStatus) => {
    if (!selectedAccountId || !activePhone) return;
    const result = await updateConversationStatus({
      accountId: selectedAccountId,
      phone: activePhone,
      status,
    });
    if (result) {
      setCurrentStatus(status);
      setStatusMap(prev => {
        const next = new Map(prev);
        next.set(activePhone, result);
        return next;
      });
    }
  }, [selectedAccountId, activePhone]);

  // 添加备注
  const handleAddNote = useCallback(async (text: string) => {
    if (!selectedAccountId || !activePhone) return;
    const note = await addNote(selectedAccountId, activePhone, text);
    if (note) setNotes(prev => [note, ...prev]);
  }, [selectedAccountId, activePhone]);

  const activeConversation = conversations.find(c => c.phone === activePhone);

  return (
    <div className="h-[calc(100vh-64px)] flex bg-background">
      {/* 左侧账号列 */}
      <AccountList
        sessions={sessions}
        selectedAccountId={selectedAccountId}
        onSelect={setSelectedAccountId}
      />

      {/* 联系人/会话列表 */}
      <ConversationList
        conversations={conversations}
        statusMap={statusMap}
        activePhone={activePhone}
        onSelect={handleSelectConversation}
      />

      {/* 消息区 */}
      {activePhone && activeConversation ? (
        <div className="flex-1 flex flex-col min-w-0">
          <ConversationToolbar
            currentStatus={currentStatus}
            onStatusChange={handleStatusChange}
          />
          <MessagePane
            messages={messages}
            contactName={activeConversation.name}
            contactPhone={activePhone}
            onSend={handleSend}
            loading={messagesLoading}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-muted/10">
          <div className="text-center text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <div className="text-sm">选择联系人开始会话</div>
          </div>
        </div>
      )}

      {/* 右侧会员信息栏（始终渲染，不闪现） */}
      <MemberInfoSidebar
        context={context}
        phone={activePhone ?? ''}
        status={currentStatus}
        notes={notes}
        onAddNote={handleAddNote}
        loading={contextLoading}
      />
    </div>
  );
}
