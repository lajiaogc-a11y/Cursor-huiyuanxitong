/**
 * 统一操作日志：createLog + withLog（服务端权威写入，结构化 JSON）
 * - operator_id 即业务上的 user_id（员工）
 */
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { insertOperationLogRepository, type InsertOperationLogParams } from '../data/repository.js';

function clientIp(req: AuthenticatedRequest): string | null {
  const xf = req.headers['x-forwarded-for'];
  const xff = typeof xf === 'string' ? xf.split(',')[0]?.trim() : '';
  const xr = typeof req.headers['x-real-ip'] === 'string' ? req.headers['x-real-ip'].trim() : '';
  const sock = req.socket?.remoteAddress;
  return xff || xr || sock || null;
}

export type CreateUnifiedLogParams = {
  /** 与权限/业务模块名一致，如 orders、data_management */
  module: string;
  /** 操作类型：create | update | delete | batch_delete | batch_action 等 */
  action: string;
  /** 单对象 id；批量时可为 null，见 targetIds */
  targetId?: string | null;
  /** 批量目标 id 列表 */
  targetIds?: string[] | null;
  /** 人类可读摘要（短） */
  description?: string | null;
  /** 请求/上下文结构化数据（禁止把唯一信息只放在 description） */
  requestData?: unknown;
  beforeData?: unknown;
  afterData?: unknown;
};

function staffFromRequest(req: AuthenticatedRequest): {
  operator_id: string | null;
  operator_account: string;
  operator_role: string;
} | null {
  const u = req.user;
  if (!u || u.type !== 'employee') return null;
  return {
    operator_id: u.id ?? null,
    operator_account: (u.username || u.real_name || 'staff').trim() || 'staff',
    operator_role: u.is_super_admin || u.is_platform_super_admin ? 'super_admin' : String(u.role || 'staff'),
  };
}

/** 写入一条操作日志（结构化） */
export async function createLog(req: AuthenticatedRequest, p: CreateUnifiedLogParams): Promise<void> {
  const s = staffFromRequest(req);
  if (!s) return;
  const row: InsertOperationLogParams = {
    ...s,
    module: p.module,
    operation_type: p.action,
    object_id: p.targetId ?? p.targetIds?.[0] ?? null,
    object_description: p.description ?? null,
    before_data: p.beforeData ?? null,
    after_data: p.afterData ?? null,
    request_data: p.requestData ?? null,
    target_ids: p.targetIds ?? null,
    ip_address: clientIp(req),
  };
  await insertOperationLogRepository(row);
}

const MAX_JSON_LEN = 48_000;

function truncateForLog(value: unknown): unknown {
  try {
    const s = JSON.stringify(value);
    if (s.length <= MAX_JSON_LEN) return value;
    return { _truncated: true, preview: s.slice(0, 2000) };
  } catch {
    return { _error: 'non_serializable' };
  }
}

export type WithLogOptions = Omit<CreateUnifiedLogParams, 'module' | 'action'> & {
  /** 成功时根据返回值补充/覆盖 afterData / description */
  mapSuccess?: (result: unknown) => Partial<Pick<CreateUnifiedLogParams, 'afterData' | 'description' | 'requestData'>>;
  /** 失败时是否记录一条日志（默认 true） */
  logFailure?: boolean;
};

/**
 * 包裹业务异步函数：成功/失败均可记录结构化日志（禁止仅在业务里手拼字符串散落记录）
 */
export async function withLog<T>(
  req: AuthenticatedRequest,
  module: string,
  action: string,
  fn: () => Promise<T>,
  options?: WithLogOptions,
): Promise<T> {
  const logFailure = options?.logFailure !== false;
  try {
    const result = await fn();
    const mapped = options?.mapSuccess?.(result);
    await createLog(req, {
      module,
      action,
      targetId: options?.targetId,
      targetIds: options?.targetIds,
      description: mapped?.description ?? options?.description,
      requestData: options?.requestData ?? undefined,
      beforeData: options?.beforeData,
      afterData: truncateForLog(mapped?.afterData ?? options?.afterData ?? result),
    });
    return result;
  } catch (err) {
    if (logFailure) {
      await createLog(req, {
        module,
        action,
        targetId: options?.targetId,
        targetIds: options?.targetIds,
        description: options?.description ?? `failed: ${(err as Error)?.message ?? String(err)}`.slice(0, 500),
        requestData: {
          ...(typeof options?.requestData === 'object' && options?.requestData !== null
            ? (options.requestData as object)
            : {}),
          error: (err as Error)?.message ?? String(err),
        },
        beforeData: options?.beforeData,
        afterData: null,
      });
    }
    throw err;
  }
}
