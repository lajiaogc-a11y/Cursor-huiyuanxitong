import { parseBackendStoredDatetimeToDate } from "@/lib/beijingTime";
import type { MemberPointsLedgerRow } from "@/services/points/memberPointsRpcService";

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Sum positive ledger credits for the member's local calendar day. */
export function sumTodayEarnedFromLedger(rows: MemberPointsLedgerRow[]): number {
  const now = new Date();
  const y = now.getFullYear();
  const mo = now.getMonth();
  const d = now.getDate();
  let sum = 0;
  for (const row of rows) {
    const dt = parseBackendStoredDatetimeToDate(row.earned_at);
    if (!dt) continue;
    if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) continue;
    const pts = num(row.points, 0);
    if (pts > 0) sum += pts;
  }
  return sum;
}
