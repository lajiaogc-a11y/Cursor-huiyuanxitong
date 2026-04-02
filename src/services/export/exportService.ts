/**
 * 数据导出服务
 */

import * as XLSX from 'xlsx';
import { apiGet } from '@/api/client';
import { getMyTenantOrdersFull, getMyTenantUsdtOrdersFull, getMyTenantMembersFull, getTenantOrdersFull, getTenantUsdtOrdersFull, getTenantMembersFull } from '@/services/tenantService';
import { EXPORTABLE_TABLES } from './tableConfig';
import { escapeCSVField, formatDateForFilename } from './utils';
import { formatBeijingTime } from '@/lib/beijingTime';
import type { ExportFormat } from './types';
import { listEmployeesApi } from '@/api/employees';
import { listCardsApi, listVendorsApi, listPaymentProvidersApi } from '@/services/shared/entityLookupService';
import { listReferralsApi } from '@/services/members/membersApiService';

export interface ExportOrdersOptions {
  tenantId?: string | null;
  useMyTenantRpc?: boolean;
}

/**
 * 获取会员导出所需的关联数据（使用 tenant-aware RPC 确保租户隔离）
 */
async function getMemberExportData(options?: ExportOrdersOptions): Promise<any[]> {
  const tenantId = options?.tenantId ?? null;
  const useMyTenantRpc = options?.useMyTenantRpc ?? true;

  let membersData: any[];
  if (tenantId && !useMyTenantRpc) {
    membersData = await getTenantMembersFull(tenantId);
  } else {
    membersData = await getMyTenantMembersFull();
  }

  const members = membersData || [];
  if (members.length === 0) return [];

  const sources: any[] = (await apiGet('/api/customer-sources/').catch((err) => { console.warn('[exportService] customer sources fetch failed silently:', err); return []; })) as any[];
  const sourceMap: Record<string, string> = {};
  (sources || []).forEach((s: any) => { sourceMap[s.id] = s.name; });

  const employees: any[] = await listEmployeesApi().catch((err) => { console.warn('[exportService] employee list fetch failed silently:', err); return []; });
  const employeeMap: Record<string, string> = {};
  (employees || []).forEach((e: any) => { employeeMap[e.id] = e.real_name; });

  const referrals: any[] = (await listReferralsApi(tenantId ?? undefined).catch((err) => {
    console.warn('[exportService] referrals fetch failed silently:', err);
    return [];
  })) as any[];
  const referralByReferee: Record<string, { phone: string; code: string }> = {};
  (referrals || []).forEach((r: any) => {
    if (r?.referee_phone) {
      referralByReferee[r.referee_phone] = {
        phone: r.referrer_phone || '',
        code: r.referrer_member_code || '',
      };
    }
  });

  return members.map((member: any) => {
    const ref = referralByReferee[member.phone_number];
    return {
      ...member,
      source_name: member.source_id ? (sourceMap[member.source_id] || '') : '',
      referrer_phone: ref?.phone || '',
      referrer_member_code: ref?.code || '',
      recorder_name: member.creator_id ? (employeeMap[member.creator_id] || '') : '',
      nickname: member.nickname ?? '',
      created_at: member.created_at ? formatBeijingTime(member.created_at) : '',
      common_cards: Array.isArray(member.common_cards) ? member.common_cards.join(', ') : (member.common_cards || ''),
      currency_preferences: Array.isArray(member.currency_preferences) ? member.currency_preferences.join(', ') : (member.currency_preferences || ''),
    };
  });
}

/**
 * 获取订单导出所需的关联数据 - 使用 RPC 避免 RLS 拦截
 */
async function getOrderExportData(options?: ExportOrdersOptions): Promise<any[]> {
  const tenantId = options?.tenantId ?? null;
  const useMyTenantRpc = options?.useMyTenantRpc ?? true;

  let ordersData: any[];
  let usdtOrdersData: any[];
  let membersData: any[];

  if (tenantId && !useMyTenantRpc) {
    [ordersData, usdtOrdersData, membersData] = await Promise.all([
      getTenantOrdersFull(tenantId),
      getTenantUsdtOrdersFull(tenantId),
      getTenantMembersFull(tenantId),
    ]);
  } else {
    [ordersData, usdtOrdersData, membersData] = await Promise.all([
      getMyTenantOrdersFull(),
      getMyTenantUsdtOrdersFull(),
      getMyTenantMembersFull(),
    ]);
  }

  const orders = [...(ordersData || []), ...(usdtOrdersData || [])].filter((o: any) => !o.is_deleted);

  const phoneToMemberCode = new Map<string, string>();
  (membersData || []).forEach((m: any) => {
    if (m.phone_number) phoneToMemberCode.set(m.phone_number, m.member_code || '');
  });

  const employees: any[] = await listEmployeesApi().catch((err) => { console.warn('[exportService] order export employee list fetch failed silently:', err); return []; });
  const employeeMap: Record<string, string> = {};
  (employees || []).forEach((e: any) => { employeeMap[e.id] = e.real_name; });

  const cards = await listCardsApi();
  const cardMap: Record<string, string> = {};
  cards?.forEach(c => { cardMap[c.id] = c.name; });

  const vendors = await listVendorsApi();
  const vendorMap: Record<string, string> = {};
  vendors?.forEach(v => { vendorMap[v.id] = v.name; });

  const providers = await listPaymentProvidersApi();
  const providerMap: Record<string, string> = {};
  providers?.forEach(p => { providerMap[p.id] = p.name; });

  const statusMap: Record<string, string> = {
    'completed': '已完成',
    'cancelled': '已取消',
    'active': '进行中',
  };

  return orders.map(order => ({
    ...order,
    created_at: formatBeijingTime(order.created_at),
    order_type: order.order_type ? (cardMap[order.order_type] || order.order_type) : '',
    card_merchant_id: order.card_merchant_id ? (vendorMap[order.card_merchant_id] || order.card_merchant_id) : '',
    vendor_id: order.vendor_id ? (providerMap[order.vendor_id] || order.vendor_id) : '',
    creator_name: order.creator_id ? (employeeMap[order.creator_id] || '') : '',
    member_code: order.phone_number ? (phoneToMemberCode.get(order.phone_number) || order.member_code_snapshot || '') : (order.member_code_snapshot || ''),
    status: statusMap[order.status] || order.status,
    profit_rate: order.profit_rate ? `${(Number(order.profit_rate) * 100).toFixed(2)}%` : '',
  }));
}

/**
 * 导出单个表的数据为 CSV
 */
export async function exportTableToCSV(
  tableName: string,
  isEnglish: boolean = false,
  options?: ExportOrdersOptions
): Promise<{ success: boolean; error?: string; filename?: string }> {
  return exportTable(tableName, isEnglish, 'csv', options);
}

/**
 * 导出单个表的数据为 XLSX
 */
export async function exportTableToXLSX(
  tableName: string,
  isEnglish: boolean = false,
  options?: ExportOrdersOptions
): Promise<{ success: boolean; error?: string; filename?: string }> {
  return exportTable(tableName, isEnglish, 'xlsx', options);
}

/**
 * 通用导出函数 - 支持 CSV 和 XLSX
 */
export async function exportTable(
  tableName: string,
  isEnglish: boolean = false,
  format: ExportFormat = 'csv',
  options?: ExportOrdersOptions
): Promise<{ success: boolean; error?: string; filename?: string }> {
  try {
    const tableConfig = EXPORTABLE_TABLES.find(t => t.tableName === tableName);
    if (!tableConfig) {
      return { success: false, error: `未找到表配置: ${tableName}` };
    }

    let data: any[];

    if (tableName === 'members') {
      data = await getMemberExportData(options);
    } else if (tableName === 'orders') {
      data = await getOrderExportData(options);
    } else {
      // 通用表导出：通过后端 API 获取数据（stub - 暂不支持通用表导出）
      console.warn(`[exportService] Generic table export for "${tableName}" not yet supported via API`);
      data = [];
    }

    if (!data || data.length === 0) {
      return { success: false, error: '没有数据可导出' };
    }

    const displayName = isEnglish ? tableConfig.displayNameEn : tableConfig.displayName;
    const headers = tableConfig.columns.map(col => isEnglish ? col.labelEn : col.label);

    if (format === 'xlsx') {
      const wsData = [
        headers,
        ...data.map(row =>
          tableConfig.columns.map(col => {
            const value = (row as any)[col.key];
            if (typeof value === 'object' && value !== null) {
              return JSON.stringify(value);
            }
            return value;
          })
        )
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, displayName.slice(0, 31));

      const filename = `${displayName}_${formatDateForFilename()}.xlsx`;
      XLSX.writeFile(wb, filename);

      return { success: true, filename };
    } else {
      const csvHeaders = headers.map(h => escapeCSVField(h));
      const rows = data.map(row =>
        tableConfig.columns.map(col => escapeCSVField((row as any)[col.key]))
      );

      const BOM = '\uFEFF';
      const csvContent = BOM + [csvHeaders.join(','), ...rows.map(row => row.join(','))].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const filename = `${displayName}_${formatDateForFilename()}.csv`;
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      return { success: true, filename };
    }
  } catch (error) {
    console.error(`Export error for ${tableName}:`, error);
    return { success: false, error: String(error) };
  }
}

/**
 * 导出所有表数据（全平台备份）
 */
export async function exportAllTables(
  isEnglish: boolean = false,
  progressCallback?: (current: number, total: number, tableName: string) => void
): Promise<{ success: boolean; error?: string; results?: { tableName: string; success: boolean; recordCount?: number; error?: string }[] }> {
  const results: { tableName: string; success: boolean; recordCount?: number; error?: string }[] = [];
  const csvFiles: { filename: string; content: string }[] = [];

  try {
    const total = EXPORTABLE_TABLES.length;

    for (let i = 0; i < EXPORTABLE_TABLES.length; i++) {
      const tableConfig = EXPORTABLE_TABLES[i];

      if (progressCallback) {
        progressCallback(i + 1, total, tableConfig.displayName);
      }

      try {
        // 通用表导出：stub - 暂不支持通过 API 批量导出
        console.warn(`[exportService] Batch export for "${tableConfig.tableName}" not yet supported via API`);
        const data: any[] = [];

        if (!data || data.length === 0) {
          results.push({ tableName: tableConfig.tableName, success: true, recordCount: 0 });
          continue;
        }

        const headers = tableConfig.columns.map(col =>
          escapeCSVField(isEnglish ? col.labelEn : col.label)
        );

        const rows = data.map(row =>
          tableConfig.columns.map(col => escapeCSVField((row as any)[col.key]))
        );

        const BOM = '\uFEFF';
        const csvContent = BOM + [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

        const displayName = isEnglish ? tableConfig.displayNameEn : tableConfig.displayName;
        csvFiles.push({
          filename: `${tableConfig.tableName}_${displayName}.csv`,
          content: csvContent,
        });

        results.push({ tableName: tableConfig.tableName, success: true, recordCount: data.length });
      } catch (err) {
        results.push({ tableName: tableConfig.tableName, success: false, error: String(err) });
      }
    }

    if (csvFiles.length === 1) {
      const blob = new Blob([csvFiles[0].content], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = csvFiles[0].filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      for (const file of csvFiles) {
        const blob = new Blob([file.content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    return { success: true, results };
  } catch (error) {
    console.error('Export all tables error:', error);
    return { success: false, error: String(error), results };
  }
}
