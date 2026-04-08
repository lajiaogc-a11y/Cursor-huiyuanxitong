/**
 * 积分流水 description 展示：库内多为历史英文模板，按当前界面语言翻译。
 * 未知格式仍原样展示（已做乱码修复）。
 */
import { repairUtf8MisdecodedAsLatin1 } from "@/lib/utf8MojibakeRepair";

export type PointsLedgerTranslateFn = (zh: string, en: string) => string;

export function normalizePointsLedgerDescription(d: string | null | undefined): string {
  if (d == null || d === "") return "";
  return repairUtf8MisdecodedAsLatin1(String(d));
}

function txnTypePair(raw: string): { zh: string; en: string } {
  const x = raw.trim().toLowerCase();
  switch (x) {
    case "consumption":
    case "regular":
    case "usdt":
      return { zh: "消费", en: "consumption" };
    case "referral_1":
      return { zh: "推荐积分1", en: "referral_1" };
    case "referral_2":
      return { zh: "推荐积分2", en: "referral_2" };
    default:
      return { zh: raw.trim(), en: raw.trim() };
  }
}

/**
 * 将单条流水备注转为当前语言；供表格、导出、搜索归一化使用。
 */
export function translatePointsLedgerDescription(
  raw: string | null | undefined,
  t: PointsLedgerTranslateFn,
): string {
  const s = normalizePointsLedgerDescription(raw);
  if (!s) return "";

  let m: RegExpMatchArray | null;

  m = s.match(/^Order points \((.+)\)$/i);
  if (m) {
    const { zh, en } = txnTypePair(m[1]);
    return t(`订单积分（${zh}）`, `Order points (${en})`);
  }

  m = s.match(/^Order cancellation rollback \((.+)\)$/i);
  if (m) {
    const { zh, en } = txnTypePair(m[1]);
    return t(`订单取消回退（${zh}）`, `Order cancellation rollback (${en})`);
  }

  m = s.match(/^Lucky spin:\s*(.+)$/i);
  if (m) {
    const name = m[1].trim();
    return t(`幸运抽奖：${name}`, `Lucky spin: ${name}`);
  }

  m = s.match(/^Refund:\s*(.+)$/i);
  if (m) {
    const title = m[1].trim();
    return t(`退款：${title}`, `Refund: ${title}`);
  }

  m = s.match(/^Activity gift deleted, points refunded \((.+)\)$/i);
  if (m) {
    const id = m[1].trim();
    return t(`活动赠送删除，积分已退回（${id}）`, `Activity gift deleted, points refunded (${id})`);
  }

  m = s.match(/^积分兑换清零\s+(.+)$/);
  if (m) {
    const rest = m[1].trim();
    return t(`积分兑换清零 ${rest}`, `Points reset on redemption ${rest}`);
  }

  m = s.match(/^删除订单\s+(.+)$/);
  if (m) {
    const id = m[1].trim();
    return t(`删除订单 ${id}`, `Order deleted ${id}`);
  }

  m = s.match(/^Points frozen \(redemption:\s*(.+?)\s*×\s*(\d+)\)$/i);
  if (m) {
    const name = m[1].trim();
    const qty = m[2];
    return t(`积分冻结（兑换：${name} ×${qty}）`, `Points frozen (redemption: ${name} ×${qty})`);
  }

  m = s.match(/^Redemption confirmed \((.*),\s*(\d+)\s*points\)$/i);
  if (m) {
    const detail = m[1].trim();
    const pts = m[2];
    return t(`兑换已确认（${detail}，${pts} 积分）`, `Redemption confirmed (${detail}, ${pts} points)`);
  }

  m = s.match(
    /^Redemption rejected, refunded \((.*),\s*refunded\s*(\d+)\s*points(?:,\s*reason:\s*(.+))?$/i,
  );
  if (m) {
    const title = m[1].trim();
    const pts = m[2];
    const reason = m[3]?.trim();
    if (reason) {
      return t(
        `兑换已拒绝并退回（${title}，退回 ${pts} 积分，原因：${reason}）`,
        `Redemption rejected, refunded (${title}, refunded ${pts} points, reason: ${reason})`,
      );
    }
    return t(
      `兑换已拒绝并退回（${title}，退回 ${pts} 积分）`,
      `Redemption rejected, refunded (${title}, refunded ${pts} points)`,
    );
  }

  m = s.match(/^Points frozen \(mall redemption:\s*(.+?)\s*(?:×\s*(\d+))?\)$/i);
  if (m) {
    const title = m[1].trim();
    const qty = m[2];
    if (qty) {
      return t(`积分冻结（商城兑换：${title} ×${qty}）`, `Points frozen (mall redemption: ${title} ×${qty})`);
    }
    return t(`积分冻结（商城兑换：${title}）`, `Points frozen (mall redemption: ${title})`);
  }

  m = s.match(
    /^Mall redemption completed \((.+?)\s*×\s*(\d+),\s*(\d+)\s*pts\)$/i,
  );
  if (m) {
    const title = m[1].trim();
    const qty = m[2];
    const pts = m[3];
    return t(
      `商城兑换已完成（${title} ×${qty}，${pts} 积分）`,
      `Mall redemption completed (${title} ×${qty}, ${pts} pts)`,
    );
  }

  m = s.match(
    /^Mall redemption cancelled, refunded \((.+?)\s*×\s*(\d+),\s*(\d+)\s*pts refunded(?:,\s*note:\s*(.+))?$/i,
  );
  if (m) {
    const title = m[1].trim();
    const qty = m[2];
    const pts = m[3];
    const note = m[4]?.trim();
    if (note) {
      return t(
        `商城兑换已取消并退款（${title} ×${qty}，退回 ${pts} 积分，备注：${note}）`,
        `Mall redemption cancelled, refunded (${title} ×${qty}, ${pts} pts refunded, note: ${note})`,
      );
    }
    return t(
      `商城兑换已取消并退款（${title} ×${qty}，退回 ${pts} 积分）`,
      `Mall redemption cancelled, refunded (${title} ×${qty}, ${pts} pts refunded)`,
    );
  }

  m = s.match(
    /^Mall redemption rejected, refunded \((.+?),\s*(\d+)\s*pts refunded(?:,\s*note:\s*(.+))?$/i,
  );
  if (m) {
    const title = m[1].trim();
    const pts = m[2];
    const note = m[3]?.trim();
    if (note) {
      return t(
        `商城兑换已拒绝并退款（${title}，退回 ${pts} 积分，备注：${note}）`,
        `Mall redemption rejected, refunded (${title}, ${pts} pts refunded, note: ${note})`,
      );
    }
    return t(
      `商城兑换已拒绝并退款（${title}，退回 ${pts} 积分）`,
      `Mall redemption rejected, refunded (${title}, ${pts} pts refunded)`,
    );
  }

  return s;
}

/** 用于搜索：原文 + 译文 合并为小写串 */
export function pointsLedgerDescriptionSearchHaystack(
  raw: string | null | undefined,
  t: PointsLedgerTranslateFn,
): string {
  const norm = normalizePointsLedgerDescription(raw).toLowerCase();
  const tr = translatePointsLedgerDescription(raw, t).toLowerCase();
  return `${norm} ${tr}`;
}
