/**
 * Balance Log Reconcile Service
 * 修复「订单归属变更/错误」导致的余额日志落错商家问题。
 *
 * 场景：订单创建时写入了 order_expense/order_income 日志，但后续订单的商家字段被修改，
 * 日志由于不可 UPDATE 而仍停留在旧商家名下，导致某个商家“多余日志”，另一个商家“缺失日志”，
 * 进而造成「变动后余额（最新）」与「实时余额」不一致。
 */

import { apiDelete, apiGet, apiPost } from "@/api/client";
import { safeNumber, safeMultiply } from "@/lib/safeCalc";
import { calculatePaymentValue } from "@/lib/orderCalculations";
import { listVendorsApi, listPaymentProvidersApi } from "@/services/shared/entityLookupService";

const PAGE_SIZE = 1000;

function tablePath(table: string): string {
  return `/api/data/table/${table}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 表代理 GET：query 对象为 PostgREST 风格参数名 → 值（已含 eq./in./not. 等前缀） */
async function tableGet<T>(table: string, query: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(query).toString();
  return apiGet<T>(`${tablePath(table)}?${qs}`);
}

async function tableSelectMaybeSingle<T>(table: string, select: string, filters: Record<string, string>): Promise<T | null> {
  return tableGet<T | null>(table, { select, single: "true", ...filters });
}

async function fetchAllPages<T>(table: string, select: string, filters: Record<string, string>, order?: string): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const q: Record<string, string> = {
      select,
      limit: String(PAGE_SIZE),
      offset: String(offset),
      ...filters,
    };
    if (order) q.order = order;
    const page = await tableGet<T[]>(table, q);
    const rows = Array.isArray(page) ? page : [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

async function tableSelectWhereIn<T>(
  table: string,
  select: string,
  column: string,
  values: string[],
  extraFilters: Record<string, string> = {},
): Promise<T[]> {
  if (values.length === 0) return [];
  const inList = values.map((v) => encodeURIComponent(v)).join(",");
  return tableGet<T[]>(table, {
    select,
    [column]: `in.(${inList})`,
    ...extraFilters,
  }).then((r) => (Array.isArray(r) ? r : []));
}

async function tableDeleteWhereIdIn(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const inList = ids.map((id) => encodeURIComponent(id)).join(",");
  await apiDelete(`${tablePath("balance_change_logs")}?id=in.(${inList})`);
}

async function tableInsertRows(table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  await apiPost(tablePath(table), { data: rows });
}

export interface MisattributedRepairResult {
  success: boolean;
  moved: number;
  deletedInvalid: number;
  errors: string[];
}

function computeProviderOrderExpenseChangeAmount(params: {
  actualPayment: number | null;
  fee: number | null;
  currency: string | null;
  foreignRate: number | null;
}): { changeAmount: number; currency: string } {
  const currency = params.currency || "NGN";
  const actualPaid = safeNumber(params.actualPayment);
  const fee = safeNumber(params.fee);
  const foreignRate = safeNumber(params.foreignRate, 1);

  const paymentValue =
    currency === "USDT"
      ? actualPaid + fee
      : calculatePaymentValue(actualPaid, foreignRate, fee, currency);

  const providerExpense = currency === "USDT" ? safeMultiply(paymentValue, foreignRate) : paymentValue;

  return { changeAmount: -providerExpense, currency };
}

/**
 * 修复代付商家：order_expense 日志 merchant_name 与订单当前 vendor_id 不一致的问题。
 */
export async function repairMisattributedProviderOrderExpenseLogs(params: {
  merchantNames: string[];
}): Promise<MisattributedRepairResult> {
  const merchantNames = (params.merchantNames || []).filter(Boolean);
  if (merchantNames.length === 0) return { success: true, moved: 0, deletedInvalid: 0, errors: [] };

  const errors: string[] = [];
  let moved = 0;
  let deletedInvalid = 0;

  for (const wrongProviderName of merchantNames) {
    try {
      const wrongProvider = await tableSelectMaybeSingle<{ id: string; name: string }>(
        "payment_providers",
        "id,name",
        { name: `eq.${wrongProviderName}` },
      );

      if (!wrongProvider) {
        errors.push(`${wrongProviderName}: provider_not_found`);
        continue;
      }

      const orderRows = await fetchAllPages<{ order_number: string }>(
        "orders",
        "order_number",
        {
          status: "eq.completed",
          is_deleted: "eq.false",
          vendor_id: `eq.${wrongProvider.id}`,
        },
      );

      const logRows = await fetchAllPages<{
        id: string;
        related_id: string | null;
        change_amount: number;
        created_at: string;
        remark: string | null;
      }>(
        "balance_change_logs",
        "id,related_id,change_amount,created_at,remark",
        {
          merchant_type: "eq.payment_provider",
          change_type: "eq.order_expense",
          merchant_name: `eq.${wrongProviderName}`,
          related_id: "not.is.null",
        },
      );

      const orderSet = new Set(orderRows.map((r) => r.order_number));
      const loggedSet = new Set(logRows.map((r) => r.related_id!).filter(Boolean));

      const extraOrderNumbers = Array.from(loggedSet).filter((orderNo) => !orderSet.has(orderNo));
      if (extraOrderNumbers.length === 0) continue;

      const ordersByNumber: Record<string, any> = {};
      for (const group of chunk(extraOrderNumbers, 200)) {
        const rows = await tableSelectWhereIn<{
          order_number: string;
          [k: string]: unknown;
        }>(
          "orders",
          "order_number,status,is_deleted,vendor_id,actual_payment,fee,currency,foreign_rate,created_at",
          "order_number",
          group,
        );
        rows.forEach((o) => {
          ordersByNumber[o.order_number] = o;
        });
      }

      const vendorIds = Array.from(
        new Set(
          extraOrderNumbers
            .map((o) => ordersByNumber[o]?.vendor_id)
            .filter((v: any) => typeof v === "string" && v.length > 0),
        ),
      );

      const providerNameById = new Map<string, string>();
      const providers = await listPaymentProvidersApi();
      providers.filter((p) => vendorIds.includes(p.id)).forEach((p) => providerNameById.set(p.id, p.name));

      const existingCorrectKey = new Set<string>();
      for (const group of chunk(extraOrderNumbers, 200)) {
        const rows = await tableSelectWhereIn<{ related_id: string | null; merchant_name: string | null }>(
          "balance_change_logs",
          "related_id,merchant_name",
          "related_id",
          group,
          {
            merchant_type: "eq.payment_provider",
            change_type: "eq.order_expense",
          },
        );
        rows.forEach((l) => {
          if (l.related_id && l.merchant_name) existingCorrectKey.add(`${l.related_id}|||${l.merchant_name}`);
        });
      }

      const deleteIds: string[] = [];
      const inserts: any[] = [];

      for (const orderNumber of extraOrderNumbers) {
        const order = ordersByNumber[orderNumber];
        const wrongLogs = logRows.filter((l) => l.related_id === orderNumber);
        wrongLogs.forEach((l) => deleteIds.push(l.id));

        if (!order || order.status !== "completed" || order.is_deleted) {
          deletedInvalid += wrongLogs.length;
          continue;
        }

        const correctProviderName = providerNameById.get(order.vendor_id);
        if (!correctProviderName) {
          deletedInvalid += wrongLogs.length;
          continue;
        }

        if (existingCorrectKey.has(`${orderNumber}|||${correctProviderName}`)) {
          continue;
        }

        const { changeAmount, currency } = computeProviderOrderExpenseChangeAmount({
          actualPayment: order.actual_payment,
          fee: order.fee,
          currency: order.currency,
          foreignRate: order.foreign_rate,
        });

        inserts.push({
          merchant_type: "payment_provider",
          merchant_name: correctProviderName,
          change_type: "order_expense",
          change_amount: changeAmount,
          balance_before: 0,
          balance_after: 0,
          related_id: orderNumber,
          remark: `订单支出: ${orderNumber} (${currency}) (归属修复)`,
          operator_name: "系统自动修复",
          created_at: order.created_at,
        });
        moved += 1;
      }

      for (const group of chunk(deleteIds, 200)) {
        await tableDeleteWhereIdIn(group);
      }

      for (const group of chunk(inserts, 200)) {
        await tableInsertRows("balance_change_logs", group);
      }
    } catch (e: any) {
      console.error("[Reconcile] Provider misattributed repair failed:", wrongProviderName, e);
      errors.push(`${wrongProviderName}: ${e?.message || String(e)}`);
    }
  }

  return { success: errors.length === 0, moved, deletedInvalid, errors };
}

/**
 * 修复卡商：order_income 日志 merchant_name 与订单当前 card_merchant_id 不一致的问题。
 */
export async function repairMisattributedVendorOrderIncomeLogs(params: {
  merchantNames: string[];
}): Promise<MisattributedRepairResult> {
  const merchantNames = (params.merchantNames || []).filter(Boolean);
  if (merchantNames.length === 0) return { success: true, moved: 0, deletedInvalid: 0, errors: [] };

  const errors: string[] = [];
  let moved = 0;
  let deletedInvalid = 0;

  for (const wrongVendorName of merchantNames) {
    try {
      const wrongVendor = await tableSelectMaybeSingle<{ id: string; name: string }>("vendors", "id,name", {
        name: `eq.${wrongVendorName}`,
      });

      if (!wrongVendor) {
        errors.push(`${wrongVendorName}: vendor_not_found`);
        continue;
      }

      const orderRows = await fetchAllPages<{ order_number: string }>(
        "orders",
        "order_number",
        {
          status: "eq.completed",
          is_deleted: "eq.false",
          card_merchant_id: `eq.${wrongVendor.id}`,
        },
      );

      const logRows = await fetchAllPages<{
        id: string;
        related_id: string | null;
        change_amount: number;
        created_at: string;
      }>(
        "balance_change_logs",
        "id,related_id,change_amount,created_at",
        {
          merchant_type: "eq.card_vendor",
          change_type: "eq.order_income",
          merchant_name: `eq.${wrongVendorName}`,
          related_id: "not.is.null",
        },
      );

      const orderSet = new Set(orderRows.map((r) => r.order_number));
      const loggedSet = new Set(logRows.map((r) => r.related_id!).filter(Boolean));

      const extraOrderNumbers = Array.from(loggedSet).filter((orderNo) => !orderSet.has(orderNo));
      if (extraOrderNumbers.length === 0) continue;

      const ordersByNumber: Record<string, any> = {};
      for (const group of chunk(extraOrderNumbers, 200)) {
        const rows = await tableSelectWhereIn<{
          order_number: string;
          [k: string]: unknown;
        }>("orders", "order_number,status,is_deleted,card_merchant_id,amount,created_at", "order_number", group);
        rows.forEach((o) => {
          ordersByNumber[o.order_number] = o;
        });
      }

      const vendorIds = Array.from(
        new Set(
          extraOrderNumbers
            .map((o) => ordersByNumber[o]?.card_merchant_id)
            .filter((v: any) => typeof v === "string" && v.length > 0),
        ),
      );

      const vendorNameById = new Map<string, string>();
      const vendors = await listVendorsApi();
      vendors.filter((v) => vendorIds.includes(v.id)).forEach((v) => vendorNameById.set(v.id, v.name));

      const existingCorrectKey = new Set<string>();
      for (const group of chunk(extraOrderNumbers, 200)) {
        const rows = await tableSelectWhereIn<{ related_id: string | null; merchant_name: string | null }>(
          "balance_change_logs",
          "related_id,merchant_name",
          "related_id",
          group,
          {
            merchant_type: "eq.card_vendor",
            change_type: "eq.order_income",
          },
        );
        rows.forEach((l) => {
          if (l.related_id && l.merchant_name) existingCorrectKey.add(`${l.related_id}|||${l.merchant_name}`);
        });
      }

      const deleteIds: string[] = [];
      const inserts: any[] = [];

      for (const orderNumber of extraOrderNumbers) {
        const order = ordersByNumber[orderNumber];
        const wrongLogs = logRows.filter((l) => l.related_id === orderNumber);
        wrongLogs.forEach((l) => deleteIds.push(l.id));

        if (!order || order.status !== "completed" || order.is_deleted) {
          deletedInvalid += wrongLogs.length;
          continue;
        }

        const correctVendorName = vendorNameById.get(order.card_merchant_id);
        if (!correctVendorName) {
          deletedInvalid += wrongLogs.length;
          continue;
        }

        if (existingCorrectKey.has(`${orderNumber}|||${correctVendorName}`)) {
          continue;
        }

        inserts.push({
          merchant_type: "card_vendor",
          merchant_name: correctVendorName,
          change_type: "order_income",
          change_amount: safeNumber(order.amount),
          balance_before: 0,
          balance_after: 0,
          related_id: orderNumber,
          remark: `订单收入: ${orderNumber} (归属修复)`,
          operator_name: "系统自动修复",
          created_at: order.created_at,
        });
        moved += 1;
      }

      for (const group of chunk(deleteIds, 200)) {
        await tableDeleteWhereIdIn(group);
      }

      for (const group of chunk(inserts, 200)) {
        await tableInsertRows("balance_change_logs", group);
      }
    } catch (e: any) {
      console.error("[Reconcile] Vendor misattributed repair failed:", wrongVendorName, e);
      errors.push(`${wrongVendorName}: ${e?.message || String(e)}`);
    }
  }

  return { success: errors.length === 0, moved, deletedInvalid, errors };
}
