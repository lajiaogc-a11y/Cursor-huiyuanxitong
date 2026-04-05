/**
 * 通用表/RPC 代理控制器
 * 前端 Supabase 代理层（client.ts）将 supabase.from('table') / supabase.rpc('fn') 转发到这里
 * 后端统一用 MySQL 查询处理
 *
 * 表 CRUD 实现在 tableProxySelectHandler / tableProxyMutationHandler；
 * RPC 分派在 rpcProxyDispatch 与各 rpc*Handler 模块。
 */
export { isTableProxyAllowed } from './tableConfig.js';
export { tableSelectController } from './tableProxySelectHandler.js';
export {
  tableInsertController,
  tableUpdateController,
  tableDeleteController,
} from './tableProxyMutationHandler.js';

import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { dispatchTableProxyRpc } from './rpcProxyDispatch.js';

// ============ POST /api/data/rpc/:fn — RPC 代理 ============

export async function rpcProxyController(req: AuthenticatedRequest, res: Response): Promise<void> {
  /** 专用路由如 POST /rpc/validate_invite_and_submit 无 :fn 参数，需从 path 解析 */
  const pathFn = (req.path || '').match(/\/rpc\/([^/]+)\/?$/)?.[1];
  const fnName = (req.params.fn as string | undefined) ?? pathFn;
  /** 统一小写，避免路由 /member_Spin 等导致未命中 case、落入默认分支 */
  const fn = String(fnName || '').trim().toLowerCase().replace(/-/g, '_');
  const params = req.body || {};
  const userId = req.user?.id;
  // 支持管理员 / 平台超管通过 p_tenant_id 指定租户（查看其他租户数据）
  const isAdmin = req.user?.role === 'admin' || req.user?.is_super_admin;
  const canSelectTenantByParam =
    req.user?.role === 'admin' || req.user?.is_super_admin || req.user?.is_platform_super_admin;
  const tenantId =
    canSelectTenantByParam && params.p_tenant_id ? String(params.p_tenant_id) : req.user?.tenant_id;

  try {
    const { result, responseSent } = await dispatchTableProxyRpc(
      req,
      res,
      fn,
      fnName,
      params,
      tenantId,
      userId,
      isAdmin,
    );
    if (responseSent) return;
    res.json({ data: result, error: null });
  } catch (e) {
    console.error(`[RPC Proxy] ${fnName} error:`, e);
    res.status(500).json({ data: null, error: { message: (e as Error).message } });
  }
}
