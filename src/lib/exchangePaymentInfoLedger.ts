export type ExchangePaymentInfoEntry = {
  id: string;
  createdAt: number;
  phone: string;
  copyPayload: string;
  copied: boolean;
  /** 提交时是否填写了银行卡；无则点击复制应提示 */
  hasBankCard?: boolean;
};

const STORAGE_VERSION = 1;
const MAX_ROWS = 50;

const listeners = new Set<() => void>();

function storageKey(tenantId: string) {
  return `exchange_payment_info_v${STORAGE_VERSION}_${tenantId}`;
}

export function normalizeTenantId(tenantId: string | null | undefined): string {
  return (tenantId && String(tenantId).trim()) || "_default";
}

/** 汇率页「付款信息」复制用金额：无千分位、无币种代码（与银行卡号空格拼接） */
export function formatExchangePaymentAmountForCopy(amount: number): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  const s = n.toFixed(8).replace(/\.?0+$/, "");
  return s;
}

/** 从展示字符串得到复制用金额片段（去千分位、去 NGN/GHS/USDT 后缀） */
export function sanitizePaymentDisplayForCopy(display: string): string {
  const s = String(display || "")
    .trim()
    .replace(/\s*(NGN|GHS|USDT)\s*$/i, "")
    .replace(/,/g, "")
    .trim();
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return String(display || "").trim();
  return formatExchangePaymentAmountForCopy(n);
}

const TRAILING_AMOUNT_CURRENCY = /([\d,]+(?:\.\d+)?)\s*(NGN|GHS|USDT)?\s*$/i;

/**
 * 将「账号 银行名 180,500 NGN」规范为「账号 银行名 180500」
 */
export function normalizePaymentCopyPayload(text: string): string {
  const t = String(text || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!t) return t;
  const m = t.match(TRAILING_AMOUNT_CURRENCY);
  if (!m || m.index === undefined) return t;
  const tail = m[0];
  const prefix = t.slice(0, m.index).trim();
  const n = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return t;
  const pay = formatExchangePaymentAmountForCopy(n);
  return prefix ? `${prefix} ${pay}` : pay;
}

/** 整条复制内容是否仅为「金额±币种」（无银行卡段） */
export function isPayloadAmountOnly(copyPayload: string): boolean {
  const s = String(copyPayload || "").trim();
  if (!s) return true;
  return /^[\d,]+(?:\.\d+)?\s*(NGN|GHS|USDT)?\s*$/i.test(s);
}

function parseRows(raw: string | null): ExchangePaymentInfoEntry[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (x): x is ExchangePaymentInfoEntry =>
          typeof x === "object" &&
          x !== null &&
          typeof (x as ExchangePaymentInfoEntry).id === "string" &&
          typeof (x as ExchangePaymentInfoEntry).phone === "string" &&
          typeof (x as ExchangePaymentInfoEntry).copyPayload === "string" &&
          typeof (x as ExchangePaymentInfoEntry).copied === "boolean" &&
          typeof (x as ExchangePaymentInfoEntry).createdAt === "number",
      )
      .map((raw) => {
        const x = raw as ExchangePaymentInfoEntry;
        const hasBankCard =
          x.hasBankCard === true
            ? true
            : x.hasBankCard === false
              ? false
              : !isPayloadAmountOnly(x.copyPayload);
        return { ...x, hasBankCard, copyPayload: normalizePaymentCopyPayload(x.copyPayload) };
      });
  } catch {
    return [];
  }
}

export function readRows(tenantId: string | null | undefined): ExchangePaymentInfoEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return parseRows(localStorage.getItem(storageKey(normalizeTenantId(tenantId))));
  } catch {
    return [];
  }
}

function writeRows(tenantId: string, rows: ExchangePaymentInfoEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(tenantId), JSON.stringify(rows));
  } catch (e) {
    console.warn("[exchangePaymentInfoLedger] save failed", e);
  }
}

function notify() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore */
    }
  });
}

export function subscribeExchangePaymentInfoLedger(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function appendExchangePaymentInfoEntry(params: {
  tenantId: string | null | undefined;
  phone: string;
  bankCard: string;
  paymentDisplay: string;
}): void {
  if (typeof window === "undefined") return;
  const tid = normalizeTenantId(params.tenantId);
  const card = (params.bankCard || "").trim();
  const pay = sanitizePaymentDisplayForCopy(params.paymentDisplay || "");
  const copyPayload = [card, pay].filter(Boolean).join(" ");
  const entry: ExchangePaymentInfoEntry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    createdAt: Date.now(),
    phone: (params.phone || "").trim(),
    copyPayload,
    copied: false,
    hasBankCard: card.length > 0,
  };
  const prev = readRows(tid);
  const next = [entry, ...prev].slice(0, MAX_ROWS);
  writeRows(tid, next);
  notify();
}

export function markExchangePaymentInfoCopied(tenantId: string | null | undefined, id: string): void {
  if (typeof window === "undefined") return;
  const tid = normalizeTenantId(tenantId);
  const prev = readRows(tid);
  const next = prev.map((r) => (r.id === id ? { ...r, copied: true } : r));
  writeRows(tid, next);
  notify();
}

export function removeExchangePaymentInfoEntry(tenantId: string | null | undefined, id: string): void {
  if (typeof window === "undefined") return;
  const tid = normalizeTenantId(tenantId);
  const prev = readRows(tid);
  const next = prev.filter((r) => r.id !== id);
  if (next.length === prev.length) return;
  writeRows(tid, next);
  notify();
}

export function clearAllExchangePaymentInfoEntries(tenantId: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const tid = normalizeTenantId(tenantId);
  writeRows(tid, []);
  notify();
}
