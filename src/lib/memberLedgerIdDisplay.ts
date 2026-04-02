/** Max length before we shorten (backend UUIDs / Supabase ids are often 36+ chars). */
const LONG_ID_THRESHOLD = 18;
const HEAD_LEN = 6;
const TAIL_LEN = 4;

/**
 * Shorten long ledger/order IDs for member UI. Data is unchanged; only display.
 * Full value is exposed via `title` for hover/tooltip (no copy UX change).
 */
export function formatMemberLedgerIdDisplay(raw: string | null | undefined): {
  display: string;
  /** Set when shortened; use as `title` on the element */
  fullTitle?: string;
} {
  const s = raw != null ? String(raw).trim() : "";
  if (!s) return { display: "—" };
  if (s.length <= LONG_ID_THRESHOLD) return { display: s };
  return {
    display: `${s.slice(0, HEAD_LEN)}…${s.slice(-TAIL_LEN)}`,
    fullTitle: s,
  };
}

/** 积分流水一行：订单号优先；否则与 order_id 同规则缩短（抽奖等仅用 reference_id 关联后台时长度一致）。 */
export function formatMemberLedgerRowOrderDisplay(row: {
  order_number?: string | null;
  order_id?: string | null;
  reference_id?: string | null;
}): { display: string; fullTitle?: string } {
  const on = row.order_number != null ? String(row.order_number).trim() : "";
  if (on) return { display: on };
  const oid = row.order_id != null ? String(row.order_id).trim() : "";
  if (oid) return formatMemberLedgerIdDisplay(oid);
  return formatMemberLedgerIdDisplay(row.reference_id);
}
