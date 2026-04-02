export type ExchangePaymentInfoEntry = {
  id: string;
  createdAt: number;
  phone: string;
  copyPayload: string;
  copied: boolean;
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

function parseRows(raw: string | null): ExchangePaymentInfoEntry[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(
      (x): x is ExchangePaymentInfoEntry =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as ExchangePaymentInfoEntry).id === "string" &&
        typeof (x as ExchangePaymentInfoEntry).phone === "string" &&
        typeof (x as ExchangePaymentInfoEntry).copyPayload === "string" &&
        typeof (x as ExchangePaymentInfoEntry).copied === "boolean" &&
        typeof (x as ExchangePaymentInfoEntry).createdAt === "number",
    );
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
  const pay = (params.paymentDisplay || "").trim();
  const copyPayload = [card, pay].filter(Boolean).join(" ");
  const entry: ExchangePaymentInfoEntry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    createdAt: Date.now(),
    phone: (params.phone || "").trim(),
    copyPayload,
    copied: false,
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
