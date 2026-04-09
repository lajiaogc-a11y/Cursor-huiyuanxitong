/**
 * Balance Log Repair Service
 * Scans for missing ledger_transactions entries and backfills them
 * 
 * 🔧 已迁移：扫描和修复均基于 ledger_transactions 表（旧 balance_change_logs 已废弃）
 */

import { dataTableApi } from '@/api/data';
import { safeNumber } from '@/lib/safeCalc';
import { createLedgerEntry } from '@/services/finance/ledgerTransactionService';
import { listVendorsApi, listPaymentProvidersApi } from '@/services/shared/entityLookupService';

export interface MissingLogSummary {
  merchantName: string;
  merchantType: 'card_vendor' | 'payment_provider';
  orderCount: number;
  logCount: number;
  missingCount: number;
}

export interface OrphanedLogSummary {
  merchantName: string;
  merchantType: 'card_vendor' | 'payment_provider';
  orphanedCount: number;
}

export interface MissingOrderDetail {
  orderId: string;
  orderNumber: string;
  merchantName: string;
  merchantType: 'card_vendor' | 'payment_provider';
  changeAmount: number;
  currency: string;
  createdAt: string;
}

export interface RepairResult {
  success: boolean;
  repaired: number;
  errors: string[];
}

// Helper: fetch all orders in batches to avoid 1000-row limit
async function fetchAllCompletedOrders(fields: string) {
  const allOrders: any[] = [];
  const batchSize = 1000;
  let offset = 0;
  let hasMore = true;
  const select = fields.replace(/\s/g, '');

  while (hasMore) {
    try {
      const data = await dataTableApi.get<unknown[]>(
        'orders',
        `select=${encodeURIComponent(select)}&status=eq.completed&is_deleted=eq.false&limit=${batchSize}&offset=${offset}`,
      );
      const rows = Array.isArray(data) ? data : [];
      if (rows.length > 0) {
        allOrders.push(...rows);
        offset += batchSize;
        hasMore = rows.length === batchSize;
      } else {
        hasMore = false;
      }
    } catch (e) {
      console.error('[RepairService] Batch fetch error:', e);
      break;
    }
  }
  return allOrders;
}

// Helper: fetch all ledger transactions matching criteria
async function fetchAllLedgerEntries(accountType: string, sourcePrefix: string) {
  const allEntries: any[] = [];
  const batchSize = 1000;
  let offset = 0;
  let hasMore = true;
  const likePat = `${sourcePrefix}%`;

  while (hasMore) {
    try {
      const data = await dataTableApi.get<unknown[]>(
        'ledger_transactions',
        `select=source_id,account_id,is_active&account_type=eq.${encodeURIComponent(accountType)}&source_type=eq.order&source_id=like.${encodeURIComponent(likePat)}&is_active=eq.true&limit=${batchSize}&offset=${offset}`,
      );
      const rows = Array.isArray(data) ? data : [];
      if (rows.length > 0) {
        allEntries.push(...rows);
        offset += batchSize;
        hasMore = rows.length === batchSize;
      } else {
        hasMore = false;
      }
    } catch (e) {
      console.error('[RepairService] Ledger fetch error:', e);
      break;
    }
  }
  return allEntries;
}

/**
 * Scan for missing vendor (card_vendor) ledger entries
 */
export async function scanMissingVendorLogs(): Promise<MissingLogSummary[]> {
  const orders = await fetchAllCompletedOrders('id, order_number, card_merchant_id, amount');
  const ordersWithVendor = orders.filter(o => o.card_merchant_id);

  const vendors = await listVendorsApi();
  const vendorMap = new Map(vendors?.map(v => [v.id, v.name]) || []);

  const ledgerEntries = await fetchAllLedgerEntries('card_vendor', 'order_v_');

  // Extract order IDs from source_id pattern: "order_v_{orderId}"
  const loggedOrderIds = new Set(
    ledgerEntries.map(e => e.source_id?.replace('order_v_', ''))
  );

  // Count per vendor
  const orderCountMap = new Map<string, number>();
  const missingCountMap = new Map<string, number>();

  ordersWithVendor.forEach(order => {
    const vendorName = vendorMap.get(order.card_merchant_id);
    if (!vendorName) return;
    orderCountMap.set(vendorName, (orderCountMap.get(vendorName) || 0) + 1);
    if (!loggedOrderIds.has(order.id)) {
      missingCountMap.set(vendorName, (missingCountMap.get(vendorName) || 0) + 1);
    }
  });

  const results: MissingLogSummary[] = [];
  orderCountMap.forEach((orderCount, vendorName) => {
    const missingCount = missingCountMap.get(vendorName) || 0;
    if (missingCount > 0) {
      results.push({
        merchantName: vendorName,
        merchantType: 'card_vendor',
        orderCount,
        logCount: orderCount - missingCount,
        missingCount,
      });
    }
  });

  return results.sort((a, b) => b.missingCount - a.missingCount);
}

/**
 * Scan for missing provider (payment_provider) ledger entries
 */
export async function scanMissingProviderLogs(): Promise<MissingLogSummary[]> {
  const orders = await fetchAllCompletedOrders('id, order_number, vendor_id, payment_value, currency');
  const ordersWithProvider = orders.filter(o => o.vendor_id);

  const providers = await listPaymentProvidersApi();
  const providerMap = new Map(providers?.map(p => [p.id, p.name]) || []);

  const ledgerEntries = await fetchAllLedgerEntries('payment_provider', 'order_p_');
  const loggedOrderIds = new Set(
    ledgerEntries.map(e => e.source_id?.replace('order_p_', ''))
  );

  const orderCountMap = new Map<string, number>();
  const missingCountMap = new Map<string, number>();

  ordersWithProvider.forEach(order => {
    const providerName = providerMap.get(order.vendor_id);
    if (!providerName) return;
    orderCountMap.set(providerName, (orderCountMap.get(providerName) || 0) + 1);
    if (!loggedOrderIds.has(order.id)) {
      missingCountMap.set(providerName, (missingCountMap.get(providerName) || 0) + 1);
    }
  });

  const results: MissingLogSummary[] = [];
  orderCountMap.forEach((orderCount, providerName) => {
    const missingCount = missingCountMap.get(providerName) || 0;
    if (missingCount > 0) {
      results.push({
        merchantName: providerName,
        merchantType: 'payment_provider',
        orderCount,
        logCount: orderCount - missingCount,
        missingCount,
      });
    }
  });

  return results.sort((a, b) => b.missingCount - a.missingCount);
}

/**
 * Get detailed list of orders missing vendor ledger entries
 */
export async function getMissingVendorOrderDetails(): Promise<MissingOrderDetail[]> {
  const orders = await fetchAllCompletedOrders('id, order_number, card_merchant_id, amount, currency, created_at');
  const ordersWithVendor = orders.filter(o => o.card_merchant_id);

  const vendors = await listVendorsApi();
  const vendorMap = new Map(vendors?.map(v => [v.id, v.name]) || []);

  const ledgerEntries = await fetchAllLedgerEntries('card_vendor', 'order_v_');
  const loggedOrderIds = new Set(
    ledgerEntries.map(e => e.source_id?.replace('order_v_', ''))
  );

  return ordersWithVendor
    .filter(o => !loggedOrderIds.has(o.id))
    .map(o => ({
      orderId: o.id,
      orderNumber: o.order_number,
      merchantName: vendorMap.get(o.card_merchant_id) || 'Unknown',
      merchantType: 'card_vendor' as const,
      changeAmount: safeNumber(o.amount),
      currency: o.currency || 'NGN',
      createdAt: o.created_at,
    }));
}

/**
 * Get detailed list of orders missing provider ledger entries
 */
export async function getMissingProviderOrderDetails(): Promise<MissingOrderDetail[]> {
  const orders = await fetchAllCompletedOrders('id, order_number, vendor_id, payment_value, currency, created_at');
  const ordersWithProvider = orders.filter(o => o.vendor_id);

  const providers = await listPaymentProvidersApi();
  const providerMap = new Map(providers?.map(p => [p.id, p.name]) || []);

  const ledgerEntries = await fetchAllLedgerEntries('payment_provider', 'order_p_');
  const loggedOrderIds = new Set(
    ledgerEntries.map(e => e.source_id?.replace('order_p_', ''))
  );

  return ordersWithProvider
    .filter(o => !loggedOrderIds.has(o.id))
    .map(o => ({
      orderId: o.id,
      orderNumber: o.order_number,
      merchantName: providerMap.get(o.vendor_id) || 'Unknown',
      merchantType: 'payment_provider' as const,
      changeAmount: -safeNumber(o.payment_value),
      currency: o.currency || 'NGN',
      createdAt: o.created_at,
    }));
}

/**
 * Backfill missing vendor ledger entries using createLedgerEntry
 */
export async function backfillVendorLogs(): Promise<RepairResult> {
  const missingOrders = await getMissingVendorOrderDetails();
  const errors: string[] = [];
  let repaired = 0;

  for (const order of missingOrders) {
    try {
      await createLedgerEntry({
        accountType: 'card_vendor',
        accountId: order.merchantName,
        sourceType: 'order',
        sourceId: `order_v_${order.orderId}`,
        amount: order.changeAmount,
        note: `订单收入: ${order.orderNumber} (历史补录)`,
        operatorName: '系统自动补录',
      });
      repaired++;
    } catch (err) {
      errors.push(`${order.orderNumber}: ${err}`);
    }
  }

  return { success: errors.length === 0, repaired, errors };
}

/**
 * Backfill missing provider ledger entries using createLedgerEntry
 */
export async function backfillProviderLogs(): Promise<RepairResult> {
  const missingOrders = await getMissingProviderOrderDetails();
  const errors: string[] = [];
  let repaired = 0;

  for (const order of missingOrders) {
    try {
      await createLedgerEntry({
        accountType: 'payment_provider',
        accountId: order.merchantName,
        sourceType: 'order',
        sourceId: `order_p_${order.orderId}`,
        amount: order.changeAmount,
        note: `订单支出: ${order.orderNumber} (${order.currency}) (历史补录)`,
        operatorName: '系统自动补录',
      });
      repaired++;
    } catch (err) {
      errors.push(`${order.orderNumber}: ${err}`);
    }
  }

  return { success: errors.length === 0, repaired, errors };
}

/**
 * Scan for orphaned ledger entries (entries without corresponding active orders)
 */
export async function scanOrphanedLogs(): Promise<OrphanedLogSummary[]> {
  const orders = await fetchAllCompletedOrders('id');
  const validOrderIds = new Set(orders.map(o => o.id));

  // Get all order-type ledger entries
  const allEntries: any[] = [];
  const batchSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      const data = await dataTableApi.get<unknown[]>(
        'ledger_transactions',
        `select=id,source_id,account_type,account_id&source_type=eq.order&is_active=eq.true&limit=${batchSize}&offset=${offset}`,
      );
      const rows = Array.isArray(data) ? data : [];
      if (rows.length > 0) {
        allEntries.push(...rows);
        offset += batchSize;
        hasMore = rows.length === batchSize;
      } else {
        hasMore = false;
      }
    } catch {
      break;
    }
  }

  const orphanedMap = new Map<string, { type: 'card_vendor' | 'payment_provider', count: number }>();

  allEntries.forEach(entry => {
    // Extract orderId from source_id like "order_v_{id}" or "order_p_{id}"
    const orderId = entry.source_id?.replace(/^order_[vp]_/, '');
    if (orderId && !validOrderIds.has(orderId)) {
      const key = `${entry.account_type}:${entry.account_id}`;
      if (!orphanedMap.has(key)) {
        orphanedMap.set(key, { type: entry.account_type, count: 0 });
      }
      orphanedMap.get(key)!.count++;
    }
  });

  return Array.from(orphanedMap.entries())
    .map(([key, data]) => ({
      merchantName: key.split(':')[1],
      merchantType: data.type,
      orphanedCount: data.count,
    }))
    .filter(r => r.orphanedCount > 0)
    .sort((a, b) => b.orphanedCount - a.orphanedCount);
}

/**
 * Delete orphaned ledger entries (soft-delete by setting is_active = false)
 */
export async function deleteOrphanedLogs(): Promise<RepairResult> {
  const orders = await fetchAllCompletedOrders('id');
  const validOrderIds = new Set(orders.map(o => o.id));

  const allEntries: any[] = [];
  const batchSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      const data = await dataTableApi.get<unknown[]>(
        'ledger_transactions',
        `select=id,source_id&source_type=eq.order&is_active=eq.true&limit=${batchSize}&offset=${offset}`,
      );
      const rows = Array.isArray(data) ? data : [];
      if (rows.length > 0) {
        allEntries.push(...rows);
        offset += batchSize;
        hasMore = rows.length === batchSize;
      } else {
        hasMore = false;
      }
    } catch {
      break;
    }
  }

  const orphanedIds = allEntries
    .filter(e => {
      const orderId = e.source_id?.replace(/^order_[vp]_/, '');
      return orderId && !validOrderIds.has(orderId);
    })
    .map(e => e.id);

  if (orphanedIds.length === 0) {
    return { success: true, repaired: 0, errors: [] };
  }

  // Soft-delete in batches
  let deleted = 0;
  const deleteBatchSize = 100;
  const errors: string[] = [];

  for (let i = 0; i < orphanedIds.length; i += deleteBatchSize) {
    const batch = orphanedIds.slice(i, i + deleteBatchSize);
    const inList = batch.join(',');
    try {
      await dataTableApi.patch('ledger_transactions', `id=in.(${inList})`, {
        data: { is_active: false },
      });
      deleted += batch.length;
    } catch (err) {
      errors.push(`Batch ${i}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { success: errors.length === 0, repaired: deleted, errors };
}
