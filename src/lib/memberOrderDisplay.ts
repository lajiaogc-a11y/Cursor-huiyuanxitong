/** Detect standard UUID strings (order_number sometimes duplicates id by mistake). */
const UUID_LIKE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidLike(s: string): boolean {
  return UUID_LIKE.test(s.trim());
}

function shortenOpaqueId(s: string): string {
  const t = s.trim();
  if (t.length <= 14) return t;
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

/**
 * Member portal "My orders" — show business order_number when present.
 * Never show a full 36-char UUID as the primary label; shorten with middle ellipsis.
 * Does not change persisted data or API payloads.
 */
export function formatMemberOrderNumberForDisplay(
  orderNumber: string | null | undefined,
  dbId: string | null | undefined,
): string {
  const on = orderNumber != null ? String(orderNumber).trim() : "";
  if (on) {
    if (isUuidLike(on)) return shortenOpaqueId(on);
    return on;
  }
  const id = dbId != null ? String(dbId).trim() : "";
  if (!id) return "—";
  if (isUuidLike(id)) return shortenOpaqueId(id);
  return id.length > 18 ? shortenOpaqueId(id) : id;
}
