import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';

export type RpcCtx = {
  fn: string;
  fnName: string | undefined;
  req: AuthenticatedRequest;
  res: Response;
  params: Record<string, unknown>;
  tenantId: string | undefined;
  userId: string | undefined;
  isAdmin: boolean | undefined;
};

/** null = this handler group does not handle fn */
export type RpcDispatchResult = { result: unknown; responseSent?: boolean } | null;
