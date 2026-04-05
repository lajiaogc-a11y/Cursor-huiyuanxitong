import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import type { RpcCtx, RpcDispatchResult } from './rpcProxyTypes.js';
import { handleRpcMemberCheckInGroup } from './rpcMemberCheckInHandler.js';
import { handleRpcStaffMallProcessGroup } from './rpcStaffMallProcessHandler.js';
import { handleRpcMemberLotteryShareGroup } from './rpcMemberLotteryShareHandler.js';
import { handleRpcMemberPointsProfileGroup } from './rpcMemberPointsProfileHandler.js';
import { handleRpcMemberMallRedeemGroup } from './rpcMemberMallRedeemHandler.js';
import { handleRpcMemberPortalAdminListsGroup } from './rpcMemberPortalAdminListsHandler.js';
import { handleRpcEmployeeMaintenanceGroup } from './rpcEmployeeMaintenanceHandler.js';
import { handleRpcPlatformConfigGroup } from './rpcPlatformConfigHandler.js';
import { handleRpcWebhookArchiveMigrationGroup } from './rpcWebhookArchiveMigrationHandler.js';

const ORDERED_HANDLERS: ((ctx: RpcCtx) => Promise<RpcDispatchResult>)[] = [
  handleRpcMemberCheckInGroup,
  handleRpcStaffMallProcessGroup,
  handleRpcMemberLotteryShareGroup,
  handleRpcMemberPointsProfileGroup,
  handleRpcMemberMallRedeemGroup,
  handleRpcMemberPortalAdminListsGroup,
  handleRpcEmployeeMaintenanceGroup,
  handleRpcPlatformConfigGroup,
  handleRpcWebhookArchiveMigrationGroup,
];

export async function dispatchTableProxyRpc(
  req: AuthenticatedRequest,
  res: Response,
  fn: string,
  fnName: string | undefined,
  params: Record<string, unknown>,
  tenantId: string | undefined,
  userId: string | undefined,
  isAdmin: boolean | undefined,
): Promise<{ result: unknown; responseSent: boolean }> {
  const ctx: RpcCtx = { fn, fnName, req, res, params, tenantId, userId, isAdmin };
  for (const h of ORDERED_HANDLERS) {
    const out = await h(ctx);
    if (out?.responseSent) {
      return { result: null, responseSent: true };
    }
    if (out) {
      return { result: out.result, responseSent: false };
    }
  }
  console.warn(`[RPC Proxy] Unknown RPC: ${fnName}, returning empty result`);
  return { result: null, responseSent: false };
}
