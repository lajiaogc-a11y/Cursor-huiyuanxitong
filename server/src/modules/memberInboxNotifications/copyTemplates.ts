/**
 * 会员收件箱通知文案：后台可配置模板 + {{占位符}}，空则使用内置默认并由系统填充变量。
 */
import { queryOne } from '../../database/index.js';

export type MemberInboxCopyBlock = {
  titleZh?: string;
  titleEn?: string;
  bodyZh?: string;
  bodyEn?: string;
};

export type MemberInboxCopyTemplatesState = {
  trade?: MemberInboxCopyBlock;
  redemption?: {
    completed?: MemberInboxCopyBlock;
    rejected?: MemberInboxCopyBlock;
  };
  announcement?: MemberInboxCopyBlock;
};

/** 与 member_inbox_notifications.category 列一致（列表筛选） */
export type MemberInboxCategory = 'trade' | 'redemption' | 'announcement' | 'other';

const DEFAULT_TRADE: Required<MemberInboxCopyBlock> = {
  titleZh: '交易完成',
  titleEn: 'Trade completed',
  bodyZh: '恭喜您交易成功，获得 {{spins}} 次转盘抽奖机会！',
  bodyEn: 'Congratulations! Your trade was completed — you earned {{spins}} wheel spin(s).',
};

const DEFAULT_RED_COMPLETED: Required<MemberInboxCopyBlock> = {
  titleZh: '兑换已完成',
  titleEn: 'Redemption completed',
  bodyZh: '您兑换的「{{item}}」×{{qty}} 已处理完成。{{points_hint}}',
  bodyEn: 'Your redemption for "{{item}}" ×{{qty}} has been completed. {{points_hint}}',
};

const DEFAULT_RED_REJECTED: Required<MemberInboxCopyBlock> = {
  titleZh: '兑换已驳回',
  titleEn: 'Redemption rejected',
  bodyZh: '您兑换的「{{item}}」已被驳回。{{points_hint}}{{note_line}}',
  bodyEn: 'Your redemption for "{{item}}" was rejected. {{points_hint}}{{note_line}}',
};

/** 公告：留空表示直接使用首页公告原标题/正文，不做套壳 */
const DEFAULT_ANNOUNCEMENT: Required<MemberInboxCopyBlock> = {
  titleZh: '{{titleZh}}',
  titleEn: '{{titleEn}}',
  bodyZh: '{{contentZh}}',
  bodyEn: '{{contentEn}}',
};

/**
 * 为管理端返回完整模板状态：空字段填入系统默认值，方便管理员查看和编辑。
 */
export function fillMemberInboxCopyDefaults(
  tpl: MemberInboxCopyTemplatesState,
): MemberInboxCopyTemplatesState {
  const f = (user: string | undefined, def: string) => {
    const s = String(user ?? '').trim();
    return s.length > 0 ? s : def;
  };
  return {
    trade: {
      titleZh: f(tpl.trade?.titleZh, DEFAULT_TRADE.titleZh),
      titleEn: f(tpl.trade?.titleEn, DEFAULT_TRADE.titleEn),
      bodyZh: f(tpl.trade?.bodyZh, DEFAULT_TRADE.bodyZh),
      bodyEn: f(tpl.trade?.bodyEn, DEFAULT_TRADE.bodyEn),
    },
    redemption: {
      completed: {
        titleZh: f(tpl.redemption?.completed?.titleZh, DEFAULT_RED_COMPLETED.titleZh),
        titleEn: f(tpl.redemption?.completed?.titleEn, DEFAULT_RED_COMPLETED.titleEn),
        bodyZh: f(tpl.redemption?.completed?.bodyZh, DEFAULT_RED_COMPLETED.bodyZh),
        bodyEn: f(tpl.redemption?.completed?.bodyEn, DEFAULT_RED_COMPLETED.bodyEn),
      },
      rejected: {
        titleZh: f(tpl.redemption?.rejected?.titleZh, DEFAULT_RED_REJECTED.titleZh),
        titleEn: f(tpl.redemption?.rejected?.titleEn, DEFAULT_RED_REJECTED.titleEn),
        bodyZh: f(tpl.redemption?.rejected?.bodyZh, DEFAULT_RED_REJECTED.bodyZh),
        bodyEn: f(tpl.redemption?.rejected?.bodyEn, DEFAULT_RED_REJECTED.bodyEn),
      },
    },
    announcement: tpl.announcement,
  };
}

function parseJsonObject(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  let v: unknown = raw;
  if (Buffer.isBuffer(v)) {
    try {
      v = JSON.parse(v.toString('utf8'));
    } catch {
      return null;
    }
  }
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function asBlock(o: unknown): MemberInboxCopyBlock | undefined {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return undefined;
  const r = o as Record<string, unknown>;
  return {
    titleZh: r.titleZh != null ? String(r.titleZh) : undefined,
    titleEn: r.titleEn != null ? String(r.titleEn) : undefined,
    bodyZh: r.bodyZh != null ? String(r.bodyZh) : undefined,
    bodyEn: r.bodyEn != null ? String(r.bodyEn) : undefined,
  };
}

export function parseMemberInboxCopyTemplatesFromDb(raw: unknown): MemberInboxCopyTemplatesState {
  const root = parseJsonObject(raw);
  if (!root) return {};
  const redemptionRaw = root.redemption;
  let redemption: MemberInboxCopyTemplatesState['redemption'];
  if (redemptionRaw && typeof redemptionRaw === 'object' && !Array.isArray(redemptionRaw)) {
    const rr = redemptionRaw as Record<string, unknown>;
    redemption = {
      completed: asBlock(rr.completed),
      rejected: asBlock(rr.rejected),
    };
  }
  return {
    trade: asBlock(root.trade),
    redemption,
    announcement: asBlock(root.announcement),
  };
}

export async function fetchMemberInboxCopyTemplates(tenantId: string): Promise<MemberInboxCopyTemplatesState> {
  const row = await queryOne<{ member_inbox_copy_templates: unknown }>(
    `SELECT member_inbox_copy_templates FROM member_portal_settings WHERE tenant_id = ? LIMIT 1`,
    [tenantId],
  );
  return parseMemberInboxCopyTemplatesFromDb(row?.member_inbox_copy_templates);
}

export function applyPlaceholderTemplate(tpl: string, vars: Record<string, string | number>): string {
  if (!tpl) return '';
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v == null ? '' : String(v);
  });
}

function pickOrDefault(user: string | undefined, def: string): string {
  const s = String(user ?? '').trim();
  return s.length > 0 ? s : def;
}

export function buildTradeSpinInboxCopy(
  tpl: MemberInboxCopyTemplatesState,
  input: { spins: number; orderId: string },
): { titleZh: string; titleEn: string; contentZh: string; contentEn: string; titleCol: string; bodyCol: string } {
  const n = Math.max(0, Math.floor(Number(input.spins) || 0));
  const vars: Record<string, string | number> = {
    spins: n,
    order_id: input.orderId,
  };
  const b = tpl.trade || {};
  const titleZh = applyPlaceholderTemplate(pickOrDefault(b.titleZh, DEFAULT_TRADE.titleZh), vars);
  const titleEn = applyPlaceholderTemplate(pickOrDefault(b.titleEn, DEFAULT_TRADE.titleEn), vars);
  const contentZh = applyPlaceholderTemplate(pickOrDefault(b.bodyZh, DEFAULT_TRADE.bodyZh), vars);
  const contentEn = applyPlaceholderTemplate(pickOrDefault(b.bodyEn, DEFAULT_TRADE.bodyEn), vars);
  return {
    titleZh,
    titleEn,
    contentZh,
    contentEn,
    titleCol: titleEn || titleZh,
    bodyCol: contentEn || contentZh,
  };
}

export function buildMallRedemptionInboxCopy(
  tpl: MemberInboxCopyTemplatesState,
  input: {
    outcome: 'completed' | 'rejected';
    itemTitle: string;
    quantity: number;
    points: number;
    note?: string | null;
  },
): { titleZh: string; titleEn: string; contentZh: string; contentEn: string; titleCol: string; bodyCol: string } {
  const qty = Math.max(1, Math.floor(input.quantity || 1));
  const pts = Math.max(0, Math.floor(Number(input.points) || 0));
  const item = input.itemTitle || '';
  let pointsHintZh = '';
  let pointsHintEn = '';
  let noteLineZh = '';
  let noteLineEn = '';
  if (input.outcome === 'completed') {
    if (pts > 0) {
      pointsHintZh = `已从冻结积分中扣除 ${pts} 积分。`;
      pointsHintEn = `${pts} points were deducted from your frozen balance.`;
    }
  } else {
    if (pts > 0) {
      pointsHintZh = `${pts} 积分已退回可用余额。`;
      pointsHintEn = `${pts} points have been returned to your balance.`;
    }
    const note = input.note?.trim() ? input.note.trim() : '';
    if (note) {
      noteLineZh = ` 说明：${note}`;
      noteLineEn = ` Note: ${note}`;
    }
  }
  const varsZh: Record<string, string | number> = {
    item,
    qty,
    points: pts,
    points_hint: pointsHintZh,
    note_line: noteLineZh,
  };
  const varsEn: Record<string, string | number> = {
    item,
    qty,
    points: pts,
    points_hint: pointsHintEn,
    note_line: noteLineEn,
  };
  const block =
    input.outcome === 'completed'
      ? tpl.redemption?.completed
      : tpl.redemption?.rejected;
  const defs = input.outcome === 'completed' ? DEFAULT_RED_COMPLETED : DEFAULT_RED_REJECTED;
  const titleZh = applyPlaceholderTemplate(pickOrDefault(block?.titleZh, defs.titleZh), varsZh);
  const titleEn = applyPlaceholderTemplate(pickOrDefault(block?.titleEn, defs.titleEn), varsEn);
  const bodyZh = applyPlaceholderTemplate(pickOrDefault(block?.bodyZh, defs.bodyZh), varsZh);
  const bodyEn = applyPlaceholderTemplate(pickOrDefault(block?.bodyEn, defs.bodyEn), varsEn);
  return {
    titleZh,
    titleEn,
    contentZh: bodyZh,
    contentEn: bodyEn,
    titleCol: titleEn || titleZh,
    bodyCol: bodyEn || bodyZh,
  };
}

export function buildAnnouncementInboxCopy(
  tpl: MemberInboxCopyTemplatesState,
  base: { titleZh: string; titleEn: string; contentZh: string; contentEn: string },
): { titleZh: string; titleEn: string; contentZh: string; contentEn: string; titleCol: string; bodyCol: string } {
  const vars: Record<string, string | number> = {
    titleZh: base.titleZh,
    titleEn: base.titleEn,
    contentZh: base.contentZh,
    contentEn: base.contentEn,
    title: base.titleEn || base.titleZh,
    content: base.contentEn || base.contentZh,
  };
  const b = tpl.announcement || {};
  const hasAny =
    String(b.titleZh ?? '').trim() ||
    String(b.titleEn ?? '').trim() ||
    String(b.bodyZh ?? '').trim() ||
    String(b.bodyEn ?? '').trim();
  if (!hasAny) {
    return {
      titleZh: base.titleZh,
      titleEn: base.titleEn,
      contentZh: base.contentZh,
      contentEn: base.contentEn,
      titleCol: base.titleEn || base.titleZh || 'Announcement',
      bodyCol: base.contentEn || base.contentZh || '',
    };
  }
  const titleZh = applyPlaceholderTemplate(pickOrDefault(b.titleZh, DEFAULT_ANNOUNCEMENT.titleZh), vars);
  const titleEn = applyPlaceholderTemplate(pickOrDefault(b.titleEn, DEFAULT_ANNOUNCEMENT.titleEn), vars);
  const contentZh = applyPlaceholderTemplate(pickOrDefault(b.bodyZh, DEFAULT_ANNOUNCEMENT.bodyZh), vars);
  const contentEn = applyPlaceholderTemplate(pickOrDefault(b.bodyEn, DEFAULT_ANNOUNCEMENT.bodyEn), vars);
  return {
    titleZh,
    titleEn,
    contentZh,
    contentEn,
    titleCol: titleEn || titleZh,
    bodyCol: contentEn || contentZh,
  };
}
