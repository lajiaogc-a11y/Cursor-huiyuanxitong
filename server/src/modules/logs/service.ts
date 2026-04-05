/**
 * Audit / login logs — list shaping and IP location backfill.
 */
import {
  listOperationLogsRepository,
  listLoginLogsRepository,
  type OperationLogsQuery,
  type OperationLogRow,
} from '../data/repository.js';
import { repairDeepStringValues, repairUtf8MisdecodedAsLatin1 } from '../../lib/utf8MojibakeRepair.js';
import { listLoginLogsMissingIpLocation, updateEmployeeLoginLogIpLocation } from './repository.js';

function coerceOperationLogJsonColumn(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === 'object') return repairDeepStringValues(value);
  if (typeof value !== 'string') return value;
  let v: unknown = repairUtf8MisdecodedAsLatin1(value).trim();
  if (v === '') return null;
  for (let i = 0; i < 3; i++) {
    if (typeof v !== 'string') break;
    const s = v.trim();
    if (!s) return null;
    try {
      v = JSON.parse(s);
    } catch {
      return repairUtf8MisdecodedAsLatin1(value);
    }
  }
  return repairDeepStringValues(v);
}

export type OperationLogListItem = {
  id: string;
  timestamp: string;
  operatorId: string | null;
  operatorAccount: string;
  operatorRole: string;
  module: string;
  operationType: string;
  objectId: string | null;
  objectDescription: string | null;
  beforeData: unknown;
  afterData: unknown;
  ipAddress: string | null;
  isRestored: boolean;
  restoredBy: string | null;
  restoredAt: string | null;
};

function mapOperationLogRow(r: OperationLogRow): OperationLogListItem {
  return {
    id: r.id,
    timestamp: r.timestamp,
    operatorId: r.operator_id,
    operatorAccount: repairUtf8MisdecodedAsLatin1(r.operator_account ?? ''),
    operatorRole: repairUtf8MisdecodedAsLatin1(r.operator_role ?? ''),
    module: repairUtf8MisdecodedAsLatin1(String(r.module ?? '')),
    operationType: repairUtf8MisdecodedAsLatin1(String(r.operation_type ?? '')),
    objectId: r.object_id,
    objectDescription: r.object_description
      ? repairUtf8MisdecodedAsLatin1(r.object_description)
      : r.object_description,
    beforeData: coerceOperationLogJsonColumn(r.before_data),
    afterData: coerceOperationLogJsonColumn(r.after_data),
    ipAddress: r.ip_address,
    isRestored: !!(r.is_restored),
    restoredBy: r.restored_by,
    restoredAt: r.restored_at,
  };
}

export async function getOperationLogsListPayload(params: {
  page: number;
  pageSize: number;
  module?: string;
  operationType?: string;
  operatorAccount?: string;
  restoreStatus?: string;
  searchTerm?: string;
  dateStart?: string;
  dateEnd?: string;
  tenantId: string | null | undefined;
  isExport: boolean;
}): Promise<{
  logs: OperationLogListItem[];
  totalCount: number;
  distinctOperators: string[];
  moduleCounts: Record<string, number>;
}> {
  const q: OperationLogsQuery & { export?: boolean } = {
    page: params.page,
    pageSize: params.pageSize,
    module: params.module,
    operationType: params.operationType,
    operatorAccount: params.operatorAccount,
    restoreStatus: params.restoreStatus,
    searchTerm: params.searchTerm,
    dateStart: params.dateStart,
    dateEnd: params.dateEnd,
    tenantId: params.tenantId || undefined,
    export: params.isExport,
  };
  const { data, count, distinctOperators, moduleCounts } = await listOperationLogsRepository(q);
  const logs = data.map(mapOperationLogRow);
  return { logs, totalCount: count, distinctOperators, moduleCounts };
}

export async function getLoginLogsListPayload(params: {
  pageSize: number;
  tenantId: string | null;
  page: number;
  role: string;
  employeeId: string | null;
}): Promise<{ rows: Awaited<ReturnType<typeof listLoginLogsRepository>>['rows']; total: number; page: number; page_size: number }> {
  const offset = (params.page - 1) * params.pageSize;
  const { rows, total } = await listLoginLogsRepository(
    params.pageSize,
    params.tenantId,
    offset,
    params.role,
    params.employeeId,
  );
  return {
    rows,
    total,
    page: params.page,
    page_size: params.pageSize,
  };
}

function normalizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (!trimmed || trimmed === 'unknown') return null;
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

export async function resolveLoginLogIpLocationsBatch(): Promise<{ resolved: number; total: number }> {
  const rows = await listLoginLogsMissingIpLocation(100);
  if (rows.length === 0) {
    return { resolved: 0, total: 0 };
  }
  let resolved = 0;
  const BATCH = 5;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (row) => {
        const normalized = normalizeIp(row.ip_address);
        if (!normalized) return;
        if (normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost') {
          await updateEmployeeLoginLogIpLocation(row.id, '本机');
          resolved++;
          return;
        }
        if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(normalized)) {
          await updateEmployeeLoginLogIpLocation(row.id, '内网');
          resolved++;
          return;
        }
        try {
          const resp = await fetch(
            `http://ip-api.com/json/${encodeURIComponent(normalized)}?fields=status,country,regionName,city&lang=zh-CN`,
            { signal: AbortSignal.timeout(3000) },
          );
          const data = (await resp.json()) as {
            status: string;
            country?: string;
            regionName?: string;
            city?: string;
          };
          if (data.status === 'success') {
            const parts = [data.city, data.regionName, data.country].filter(Boolean);
            const location = parts.join(', ') || null;
            if (location) {
              await updateEmployeeLoginLogIpLocation(row.id, location);
              resolved++;
            }
          }
        } catch {
          /* best effort */
        }
      }),
    );
    if (i + BATCH < rows.length) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return { resolved, total: rows.length };
}
