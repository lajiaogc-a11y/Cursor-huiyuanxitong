/**
 * 消息 / 联系人 / 会话 JSON 文件持久化
 *
 * 存储目录结构：
 *   {dataPath}/
 *     {sessionId}/
 *       auth/          ← Baileys useMultiFileAuthState 管理
 *       contacts.json  ← 联系人快照
 *       conversations.json ← 会话列表
 *       messages/
 *         {jid}.json   ← 单个聊天的消息数组
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ── 持久化结构 ──

export interface StoredContact {
  jid: string;
  name: string;
  phone: string;
  notify?: string;
}

export interface StoredConversation {
  jid: string;
  phone: string;
  name: string;
  lastMessage: string;
  lastMessageAt: number;
  unreadCount: number;
  status: string;
}

export interface StoredMessage {
  id: string;
  fromMe: boolean;
  body: string;
  timestamp: number;
  type: string;
  status?: string;
  remoteJid?: string;
}

// ── 工具函数 ──

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readJson<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(path: string, data: unknown) {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

// ── JID → phone 提取 ──

export function jidToPhone(jid: string): string {
  return jid.split('@')[0].split(':')[0];
}

function sanitizeJid(jid: string): string {
  return jid.replace(/[/:*?"<>|\\]/g, '_');
}

// ── SessionStore 类 ──

export class SessionStore {
  private basePath: string;
  private contacts: Map<string, StoredContact>;
  private conversations: Map<string, StoredConversation>;

  constructor(dataPath: string, sessionId: string) {
    this.basePath = join(dataPath, sessionId);
    ensureDir(this.basePath);
    ensureDir(join(this.basePath, 'messages'));
    this.contacts = new Map();
    this.conversations = new Map();
    this.loadFromDisk();
  }

  private contactsPath() { return join(this.basePath, 'contacts.json'); }
  private conversationsPath() { return join(this.basePath, 'conversations.json'); }
  private messagesPath(jid: string) { return join(this.basePath, 'messages', `${sanitizeJid(jid)}.json`); }

  private loadFromDisk() {
    const contacts = readJson<StoredContact[]>(this.contactsPath(), []);
    for (const c of contacts) this.contacts.set(c.jid, c);

    const convs = readJson<StoredConversation[]>(this.conversationsPath(), []);
    for (const c of convs) this.conversations.set(c.jid, c);
  }

  // ── Contacts ──

  upsertContacts(contacts: Array<{ id: string; name?: string; notify?: string }>) {
    let changed = false;
    for (const c of contacts) {
      if (!c.id || !c.id.includes('@')) continue;
      const existing = this.contacts.get(c.id);
      const name = c.name || c.notify || existing?.name || jidToPhone(c.id);
      const updated: StoredContact = {
        jid: c.id,
        name,
        phone: jidToPhone(c.id),
        notify: c.notify || existing?.notify,
      };
      this.contacts.set(c.id, updated);
      changed = true;
    }
    if (changed) this.saveContacts();
  }

  getContactName(jid: string): string {
    return this.contacts.get(jid)?.name || jidToPhone(jid);
  }

  private saveContacts() {
    writeJson(this.contactsPath(), Array.from(this.contacts.values()));
  }

  // ── Conversations ──

  getConversations(): StoredConversation[] {
    return Array.from(this.conversations.values())
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }

  upsertConversation(jid: string, partial: Partial<StoredConversation>) {
    const existing = this.conversations.get(jid);
    const updated: StoredConversation = {
      jid,
      phone: partial.phone ?? existing?.phone ?? jidToPhone(jid),
      name: partial.name ?? existing?.name ?? this.getContactName(jid),
      lastMessage: partial.lastMessage ?? existing?.lastMessage ?? '',
      lastMessageAt: partial.lastMessageAt ?? existing?.lastMessageAt ?? Date.now(),
      unreadCount: partial.unreadCount ?? existing?.unreadCount ?? 0,
      status: partial.status ?? existing?.status ?? 'unread',
    };
    this.conversations.set(jid, updated);
    this.saveConversations();
  }

  markConversationRead(jid: string) {
    const c = this.conversations.get(jid);
    if (!c) return;
    c.unreadCount = 0;
    if (c.status === 'unread') c.status = 'read_no_reply';
    this.saveConversations();
  }

  updateConversationStatus(jid: string, status: string) {
    const c = this.conversations.get(jid);
    if (!c) return;
    c.status = status;
    if (status === 'closed') c.unreadCount = 0;
    this.saveConversations();
  }

  private saveConversations() {
    writeJson(this.conversationsPath(), Array.from(this.conversations.values()));
  }

  // ── Messages ──

  getMessages(jid: string, limit = 100): StoredMessage[] {
    const all = readJson<StoredMessage[]>(this.messagesPath(jid), []);
    return all.slice(-limit);
  }

  appendMessage(jid: string, msg: StoredMessage) {
    const msgs = readJson<StoredMessage[]>(this.messagesPath(jid), []);
    if (msgs.some(m => m.id === msg.id)) return;
    msgs.push(msg);
    // 每个聊天最多保留 500 条
    if (msgs.length > 500) msgs.splice(0, msgs.length - 500);
    writeJson(this.messagesPath(jid), msgs);
  }

  appendMessages(jid: string, newMsgs: StoredMessage[]) {
    const msgs = readJson<StoredMessage[]>(this.messagesPath(jid), []);
    const existingIds = new Set(msgs.map(m => m.id));
    let added = 0;
    for (const m of newMsgs) {
      if (existingIds.has(m.id)) continue;
      msgs.push(m);
      existingIds.add(m.id);
      added++;
    }
    if (added === 0) return;
    msgs.sort((a, b) => a.timestamp - b.timestamp);
    if (msgs.length > 500) msgs.splice(0, msgs.length - 500);
    writeJson(this.messagesPath(jid), msgs);
  }

  // ── Stats ──

  getStats() {
    let unreadCount = 0, readNoReplyCount = 0, followUpCount = 0, priorityCount = 0;
    for (const c of this.conversations.values()) {
      if (c.status === 'unread') unreadCount += c.unreadCount || 1;
      if (c.status === 'read_no_reply') readNoReplyCount++;
      if (c.status === 'follow_up_required') followUpCount++;
      if (c.status === 'priority') priorityCount++;
    }
    return {
      totalConversations: this.conversations.size,
      unreadCount,
      readNoReplyCount,
      followUpCount,
      priorityCount,
    };
  }
}
