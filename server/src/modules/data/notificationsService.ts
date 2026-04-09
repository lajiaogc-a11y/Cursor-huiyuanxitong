/**
 * 通知 Service — 员工通知查询
 */

export interface NotificationRow {
  id: string;
  recipient_id: string;
  title: string;
  message: string;
  type: string;
  category: string;
  metadata: Record<string, unknown>;
  is_read: unknown;
  link: string | null;
  created_at: string;
}

export async function getNotificationsForUser(userId: string): Promise<NotificationRow[]> {
  const { query } = await import('../../database/index.js');
  const rows = await query(
    `SELECT id, user_id AS recipient_id, title, content AS message, type,
     category, metadata, is_read, link, created_at
     FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    [userId],
  );
  return (rows as Record<string, unknown>[]).map((r) => {
    let meta: Record<string, unknown> = {};
    const raw = r.metadata;
    if (raw != null && typeof raw === 'object' && !Buffer.isBuffer(raw)) {
      meta = raw as Record<string, unknown>;
    } else if (typeof raw === 'string' && raw.trim()) {
      try { meta = JSON.parse(raw) as Record<string, unknown>; } catch { meta = {}; }
    }
    return {
      ...r,
      category: (r.category as string) ?? 'system',
      metadata: meta,
    } as NotificationRow;
  });
}
