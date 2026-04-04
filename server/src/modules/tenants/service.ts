import { verifyEmployeeLoginRepository } from '../auth/repository.js';
import {
  createTenantWithAdminRepository,
  deleteTenantRepository,
  resetTenantAdminPasswordRepository,
  setTenantSuperAdminRepository,
  syncAuthPasswordViaEdgeRepository,
  updateTenantBasicInfoRepository,
} from './repository.js';

export interface TenantActor {
  id: string;
  username?: string;
  is_platform_super_admin?: boolean;
}

function ensurePlatformAdmin(actor: TenantActor) {
  if (!actor.is_platform_super_admin) {
    return { success: false as const, errorCode: 'FORBIDDEN', message: 'Platform admin only' };
  }
  return null;
}

export async function createTenantWithAdminService(
  actor: TenantActor,
  input: {
    tenantCode: string;
    tenantName: string;
    adminUsername: string;
    adminRealName: string;
    adminPassword: string;
  }
) {
  const forbidden = ensurePlatformAdmin(actor);
  if (forbidden) return forbidden;

  let result: Awaited<ReturnType<typeof createTenantWithAdminRepository>>;
  try {
    result = await createTenantWithAdminRepository(input);
  } catch (e) {
    if (e instanceof Error && e.message === 'PASSWORD_PROBE_FAILED') {
      return {
        success: false as const,
        errorCode: 'PASSWORD_PROBE_FAILED',
        message: 'Admin password verification failed after tenant creation; transaction rolled back. Please try again.',
      };
    }
    throw e;
  }
  if (!result.success) {
    return { success: false as const, errorCode: result.errorCode ?? 'UNKNOWN', message: result.message };
  }

  // bcrypt 已在事务内直接写入且探针验证通过，sync 为冗余兜底（不影响主流程成功）
  const sync = await syncAuthPasswordViaEdgeRepository(input.adminUsername.trim(), input.adminPassword);
  return {
    success: true as const,
    tenantId: result.tenantId,
    adminEmployeeId: result.adminEmployeeId,
    authSyncSuccess: sync.success,
    authSyncMessage: sync.message,
  };
}

export async function updateTenantBasicInfoService(
  actor: TenantActor,
  input: {
    tenantId: string;
    tenantCode: string;
    tenantName: string;
    status: string;
  }
) {
  const forbidden = ensurePlatformAdmin(actor);
  if (forbidden) return forbidden;
  return updateTenantBasicInfoRepository(input);
}

export async function resetTenantAdminPasswordService(
  actor: TenantActor,
  input: {
    tenantId: string;
    adminEmployeeId?: string | null;
    newPassword: string;
  }
) {
  const forbidden = ensurePlatformAdmin(actor);
  if (forbidden) return forbidden;

  const result = await resetTenantAdminPasswordRepository(input);
  if (!result.success) {
    return { success: false as const, errorCode: result.errorCode ?? 'UNKNOWN', message: result.message };
  }

  const sync = result.adminUsername
    ? await syncAuthPasswordViaEdgeRepository(result.adminUsername, input.newPassword)
    : { success: false, message: 'Admin username missing' };

  return {
    success: true as const,
    adminEmployeeId: result.adminEmployeeId,
    adminUsername: result.adminUsername,
    adminRealName: result.adminRealName,
    authSyncSuccess: sync.success,
    authSyncMessage: sync.message,
  };
}

export async function deleteTenantService(
  actor: TenantActor,
  input: {
    tenantId: string;
    force?: boolean;
    password: string;
  }
) {
  const forbidden = ensurePlatformAdmin(actor);
  if (forbidden) return forbidden;
  if (!actor.username) {
    return { success: false as const, errorCode: 'UNAUTHORIZED', message: 'User not found' };
  }
  const verify = await verifyEmployeeLoginRepository(actor.username, input.password);
  const row = verify.data?.[0];
  if (verify.error || !row || (row as { error_code?: string | null }).error_code) {
    return { success: false as const, errorCode: 'INVALID_PASSWORD', message: 'Incorrect password' };
  }
  return deleteTenantRepository({ tenantId: input.tenantId, force: input.force });
}

export async function setTenantSuperAdminService(actor: TenantActor, employeeId: string) {
  const forbidden = ensurePlatformAdmin(actor);
  if (forbidden) return forbidden;
  return setTenantSuperAdminRepository(employeeId);
}
