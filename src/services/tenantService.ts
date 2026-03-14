import { supabase } from "@/integrations/supabase/client";
import { fail, getErrorMessage, ok, ServiceResult } from "@/services/serviceResult";

export interface TenantItem {
  id: string;
  tenant_code: string;
  tenant_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  admin_employee_id?: string | null;
  admin_username?: string | null;
  admin_real_name?: string | null;
  admin_count?: number | null;
}

export interface CreateTenantWithAdminParams {
  tenantCode: string;
  tenantName: string;
  adminUsername: string;
  adminRealName: string;
  adminPassword: string;
}

export interface CreateTenantConflicts {
  tenantCodeExists: boolean;
  adminUsernameExists: boolean;
  adminRealNameExists: boolean;
}

function isMultiTenantNotReadyError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || "");
  const code = String((error as { code?: string })?.code || "");

  return (
    code === "PGRST202" ||
    code === "PGRST205" ||
    code === "42P01" ||
    message.includes("Could not find the table 'public.tenants' in the schema cache") ||
    message.includes("Could not find the function public.list_tenants_for_platform_admin") ||
    message.includes("Could not find the function public.create_tenant_with_admin") ||
    message.includes("Could not find the function public.create_tenant_with_admin_and_migrate_current_data")
  );
}

export async function checkCreateTenantConflicts(
  tenantCode: string,
  adminUsername: string,
  adminRealName: string
): Promise<CreateTenantConflicts> {
  const { data, error } = await (supabase.rpc as any)("check_tenant_create_conflicts", {
    p_tenant_code: tenantCode.trim(),
    p_admin_username: adminUsername.trim(),
    p_admin_real_name: adminRealName.trim(),
  });

  if (error) {
    throw new Error(error.message || "Check conflicts failed");
  }

  const row = Array.isArray(data) ? data[0] : null;
  return {
    tenantCodeExists: !!row?.tenant_code_exists,
    adminUsernameExists: !!row?.admin_username_exists,
    adminRealNameExists: !!row?.admin_real_name_exists,
  };
}

export async function updateTenantBasicInfo(params: {
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  status: string;
}): Promise<{ success: boolean; errorCode?: string }> {
  const { data, error } = await (supabase.rpc as any)("update_tenant_basic_info", {
    p_tenant_id: params.tenantId,
    p_tenant_code: params.tenantCode.trim(),
    p_tenant_name: params.tenantName.trim(),
    p_status: params.status.trim(),
  });

  if (error) {
    throw new Error(error.message || "Update tenant failed");
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    return { success: false, errorCode: "EMPTY_RESULT" };
  }

  return {
    success: !!row.success,
    errorCode: row.error_code || undefined,
  };
}

export async function resetTenantAdminPassword(params: {
  tenantId: string;
  adminEmployeeId?: string | null;
  newPassword: string;
}): Promise<{
  success: boolean;
  errorCode?: string;
  adminEmployeeId?: string;
  adminUsername?: string;
  adminRealName?: string;
}> {
  const { data, error } = await (supabase.rpc as any)("reset_tenant_admin_password", {
    p_tenant_id: params.tenantId,
    p_admin_employee_id: params.adminEmployeeId ?? null,
    p_new_password: params.newPassword,
  });

  if (error) {
    throw new Error(error.message || "Reset tenant admin password failed");
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    return { success: false, errorCode: "EMPTY_RESULT" };
  }

  return {
    success: !!row.success,
    errorCode: row.error_code || undefined,
    adminEmployeeId: row.admin_employee_id || undefined,
    adminUsername: row.admin_username || undefined,
    adminRealName: row.admin_real_name || undefined,
  };
}

export async function listTenants(): Promise<TenantItem[]> {
  const { data: rpcData, error: rpcError } = await (supabase.rpc as any)("list_tenants_for_platform_admin");
  if (!rpcError) {
    return (rpcData || []) as TenantItem[];
  }

  if (isMultiTenantNotReadyError(rpcError)) {
    throw new Error("MULTI_TENANT_NOT_READY");
  }

  throw new Error(rpcError.message || "Failed to load tenants");
}

export async function createTenantWithAdmin(params: CreateTenantWithAdminParams): Promise<{
  success: boolean;
  tenantId?: string;
  adminEmployeeId?: string;
  errorCode?: string;
}> {
  const { data, error } = await (supabase.rpc as any)("create_tenant_with_admin", {
    p_tenant_code: params.tenantCode.trim(),
    p_tenant_name: params.tenantName.trim(),
    p_admin_username: params.adminUsername.trim(),
    p_admin_real_name: params.adminRealName.trim(),
    p_admin_password: params.adminPassword,
  });

  if (error) {
    if (isMultiTenantNotReadyError(error)) {
      return { success: false, errorCode: "MULTI_TENANT_NOT_READY" };
    }
    throw new Error(error.message || "Create tenant failed");
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    return { success: false, errorCode: "EMPTY_RESULT" };
  }

  return {
    success: !!row.success,
    tenantId: row.tenant_id || undefined,
    adminEmployeeId: row.admin_employee_id || undefined,
    errorCode: row.error_code || undefined,
  };
}

export async function deleteTenant(params: {
  tenantId: string;
  force?: boolean;
  username?: string;
  password?: string;
}): Promise<{ success: boolean; errorCode?: string; detail?: string }> {
  const { data, error } = await (supabase.rpc as any)("delete_tenant", {
    p_tenant_id: params.tenantId,
    p_force: params.force ?? false,
    p_username: params.username ?? null,
    p_password: params.password ?? null,
  });

  if (error) {
    if (isMultiTenantNotReadyError(error)) {
      return { success: false, errorCode: "MULTI_TENANT_NOT_READY" };
    }
    throw new Error(error.message || "Delete tenant failed");
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    return { success: false, errorCode: "EMPTY_RESULT" };
  }

  return {
    success: !!row.success,
    errorCode: row.error_code || undefined,
    detail: row.detail || undefined,
  };
}

export async function getTenantOrdersFull(tenantId: string): Promise<any[]> {
  const { data, error } = await (supabase.rpc as any)("platform_get_tenant_orders_full", {
    p_tenant_id: tenantId,
  });
  if (error) throw new Error(error.message || "Failed to get tenant orders");
  return data || [];
}

export async function getTenantUsdtOrdersFull(tenantId: string): Promise<any[]> {
  const { data, error } = await (supabase.rpc as any)("platform_get_tenant_usdt_orders_full", {
    p_tenant_id: tenantId,
  });
  if (error) throw new Error(error.message || "Failed to get tenant USDT orders");
  return data || [];
}

export async function getTenantMembersFull(tenantId: string): Promise<any[]> {
  const { data, error } = await (supabase.rpc as any)("platform_get_tenant_members_full", {
    p_tenant_id: tenantId,
  });
  if (error) throw new Error(error.message || "Failed to get tenant members");
  return data || [];
}

/** 租户员工专用：根据当前用户 employee.tenant_id 获取本租户数据，无需传参，避免 platform RPC 鉴权失败 */
export async function getMyTenantOrdersFull(): Promise<any[]> {
  const { data, error } = await (supabase.rpc as any)("get_my_tenant_orders_full", {});
  if (error) throw new Error(error.message || "Failed to get my tenant orders");
  return data || [];
}

export async function getMyTenantUsdtOrdersFull(): Promise<any[]> {
  const { data, error } = await (supabase.rpc as any)("get_my_tenant_usdt_orders_full", {});
  if (error) throw new Error(error.message || "Failed to get my tenant USDT orders");
  return data || [];
}

export async function getMyTenantMembersFull(): Promise<any[]> {
  const { data, error } = await (supabase.rpc as any)("get_my_tenant_members_full", {});
  if (error) throw new Error(error.message || "Failed to get my tenant members");
  return data || [];
}

export async function getMyTenantDashboardTrend(
  startDate: Date,
  endDate: Date,
  salesPerson: string | null
): Promise<{ rows: any[]; summary: any }> {
  const { data, error } = await (supabase.rpc as any)("get_my_tenant_dashboard_trend", {
    p_start_date: startDate.toISOString(),
    p_end_date: endDate.toISOString(),
    p_sales_person: salesPerson || null,
  });
  if (error) throw new Error(error.message || "Failed to get my tenant dashboard trend");
  const raw = (data || []).map((row: any) => {
    const dayDate = row.day_date;
    const d = dayDate ? new Date(dayDate) : null;
    return {
      date: d ? `${d.getMonth() + 1}/${d.getDate()}` : '',
      orders: Number(row.order_count) || 0,
      profit: parseFloat((Number(row.profit) || 0).toFixed(2)),
      users: Number(row.trading_users) || 0,
      ngnVolume: Number(row.ngn_volume) || 0,
      ghsVolume: Number(row.ghs_volume) || 0,
      usdtVolume: Number(row.usdt_volume) || 0,
      ngnProfit: Number(row.ngn_profit) || 0,
      ghsProfit: Number(row.ghs_profit) || 0,
      usdtProfit: Number(row.usdt_profit) || 0,
      _isSummary: !dayDate,
    };
  });
  const summaryRow = raw.find((r: any) => r._isSummary);
  const rows = raw.filter((r: any) => !r._isSummary);
  const emptySummary = {
    totalOrders: 0, tradingUsers: 0,
    ngnVolume: 0, ghsVolume: 0, usdtVolume: 0,
    ngnProfit: 0, ghsProfit: 0, usdtProfit: 0,
  };
  const summary = summaryRow
    ? {
        totalOrders: summaryRow.orders,
        tradingUsers: summaryRow.users,
        ngnVolume: summaryRow.ngnVolume,
        ghsVolume: summaryRow.ghsVolume,
        usdtVolume: summaryRow.usdtVolume,
        ngnProfit: summaryRow.ngnProfit,
        ghsProfit: summaryRow.ghsProfit,
        usdtProfit: summaryRow.usdtProfit,
      }
    : (() => {
        const reduced = rows.reduce(
          (acc: any, r: any) => ({
            ...acc,
            totalOrders: acc.totalOrders + r.orders,
            ngnVolume: acc.ngnVolume + r.ngnVolume,
            ghsVolume: acc.ghsVolume + r.ghsVolume,
            usdtVolume: acc.usdtVolume + r.usdtVolume,
            ngnProfit: acc.ngnProfit + r.ngnProfit,
            ghsProfit: acc.ghsProfit + r.ghsProfit,
            usdtProfit: acc.usdtProfit + r.usdtProfit,
          }),
          { ...emptySummary }
        );
        return { ...reduced, tradingUsers: 0 };
      })();
  return { rows, summary };
}

export async function getTenantDashboardTrend(
  tenantId: string,
  startDate: Date,
  endDate: Date,
  salesPerson: string | null
): Promise<{ rows: any[]; summary: any }> {
  const { data, error } = await (supabase.rpc as any)("platform_get_dashboard_trend_data", {
    p_tenant_id: tenantId,
    p_start_date: startDate.toISOString(),
    p_end_date: endDate.toISOString(),
    p_sales_person: salesPerson || null,
  });
  if (error) throw new Error(error.message || "Failed to get tenant dashboard trend");
  const raw = (data || []).map((row: any) => {
    const dayDate = row.day_date;
    const d = dayDate ? new Date(dayDate) : null;
    return {
      date: d ? `${d.getMonth() + 1}/${d.getDate()}` : '',
      orders: Number(row.order_count) || 0,
      profit: parseFloat((Number(row.profit) || 0).toFixed(2)),
      users: Number(row.trading_users) || 0,
      ngnVolume: Number(row.ngn_volume) || 0,
      ghsVolume: Number(row.ghs_volume) || 0,
      usdtVolume: Number(row.usdt_volume) || 0,
      ngnProfit: Number(row.ngn_profit) || 0,
      ghsProfit: Number(row.ghs_profit) || 0,
      usdtProfit: Number(row.usdt_profit) || 0,
      _isSummary: !dayDate,
    };
  });
  const summaryRow = raw.find((r: any) => r._isSummary);
  const rows = raw.filter((r: any) => !r._isSummary);
  const emptySummary = {
    totalOrders: 0, tradingUsers: 0,
    ngnVolume: 0, ghsVolume: 0, usdtVolume: 0,
    ngnProfit: 0, ghsProfit: 0, usdtProfit: 0,
  };
  const summary = summaryRow
    ? {
        totalOrders: summaryRow.orders,
        tradingUsers: summaryRow.users,
        ngnVolume: summaryRow.ngnVolume,
        ghsVolume: summaryRow.ghsVolume,
        usdtVolume: summaryRow.usdtVolume,
        ngnProfit: summaryRow.ngnProfit,
        ghsProfit: summaryRow.ghsProfit,
        usdtProfit: summaryRow.usdtProfit,
      }
    : (() => {
        const reduced = rows.reduce(
          (acc: any, r: any) => ({
            ...acc,
            totalOrders: acc.totalOrders + r.orders,
            ngnVolume: acc.ngnVolume + r.ngnVolume,
            ghsVolume: acc.ghsVolume + r.ghsVolume,
            usdtVolume: acc.usdtVolume + r.usdtVolume,
            ngnProfit: acc.ngnProfit + r.ngnProfit,
            ghsProfit: acc.ghsProfit + r.ghsProfit,
            usdtProfit: acc.usdtProfit + r.usdtProfit,
          }),
          { ...emptySummary }
        );
        return { ...reduced, tradingUsers: 0 };
      })();
  return { rows, summary };
}

export async function getTenantEmployeesFull(tenantId: string): Promise<any[]> {
  const { data, error } = await (supabase.rpc as any)("platform_get_tenant_employees_full", {
    p_tenant_id: tenantId,
  });
  if (error) throw new Error(error.message || "Failed to get tenant employees");
  return data || [];
}

export async function getTenantDataOverview(tenantId: string): Promise<{
  order_count: number;
  member_count: number;
  employee_count: number;
}> {
  const { data, error } = await (supabase.rpc as any)("platform_get_tenant_overview", {
    p_tenant_id: tenantId,
  });
  if (error) throw new Error(error.message || "Failed to get tenant overview");
  const row = Array.isArray(data) ? data[0] : null;
  return {
    order_count: Number(row?.order_count ?? 0),
    member_count: Number(row?.member_count ?? 0),
    employee_count: Number(row?.employee_count ?? 0),
  };
}

export async function getTenantOrders(
  tenantId: string,
  limit = 50,
  offset = 0
): Promise<Array<{
  id: string;
  order_number: string;
  order_type: string;
  amount: number;
  currency: string | null;
  status: string;
  phone_number: string | null;
  created_at: string;
  completed_at: string | null;
}>> {
  const { data, error } = await (supabase.rpc as any)("platform_get_tenant_orders", {
    p_tenant_id: tenantId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(error.message || "Failed to get tenant orders");
  return (data || []) as any[];
}

export async function getTenantMembers(
  tenantId: string,
  limit = 50,
  offset = 0
): Promise<Array<{
  id: string;
  member_code: string;
  phone_number: string;
  member_level: string | null;
  created_at: string;
}>> {
  const { data, error } = await (supabase.rpc as any)("platform_get_tenant_members", {
    p_tenant_id: tenantId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(error.message || "Failed to get tenant members");
  return (data || []) as any[];
}

export async function setTenantSuperAdmin(employeeId: string): Promise<{ success: boolean; errorCode?: string }> {
  const { data, error } = await (supabase.rpc as any)("set_tenant_super_admin", {
    p_employee_id: employeeId,
  });

  if (error) {
    throw new Error(error.message || "Set super admin failed");
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    return { success: false, errorCode: "EMPTY_RESULT" };
  }

  return {
    success: !!row.success,
    errorCode: row.error_code || undefined,
  };
}

function mapTenantError(error: unknown) {
  const message = getErrorMessage(error);
  if (message.includes("MULTI_TENANT_NOT_READY")) {
    return fail("MULTI_TENANT_NOT_READY", "Multi-tenant module not ready", "TENANT", error);
  }
  if (message.includes("EMPTY_RESULT")) {
    return fail("EMPTY_RESULT", "Empty result", "TENANT", error);
  }
  if (message.includes("tenant_not_found")) {
    return fail("TENANT_NOT_FOUND", "Tenant not found", "TENANT", error);
  }
  if (message.includes("admin_not_found")) {
    return fail("ADMIN_NOT_FOUND", "Admin not found", "TENANT", error);
  }
  return fail("UNKNOWN", message || "Tenant service failed", "TENANT", error, true);
}

export async function listTenantsResult(): Promise<ServiceResult<TenantItem[]>> {
  try {
    const data = await listTenants();
    return ok(data);
  } catch (error) {
    return mapTenantError(error);
  }
}

export async function getTenantOrdersFullResult(tenantId: string): Promise<ServiceResult<any[]>> {
  try {
    const data = await getTenantOrdersFull(tenantId);
    return ok(data);
  } catch (error) {
    return mapTenantError(error);
  }
}

export async function getTenantUsdtOrdersFullResult(tenantId: string): Promise<ServiceResult<any[]>> {
  try {
    const data = await getTenantUsdtOrdersFull(tenantId);
    return ok(data);
  } catch (error) {
    return mapTenantError(error);
  }
}

export async function getMyTenantOrdersFullResult(): Promise<ServiceResult<any[]>> {
  try {
    const data = await getMyTenantOrdersFull();
    return ok(data);
  } catch (error) {
    return mapTenantError(error);
  }
}

export async function getMyTenantUsdtOrdersFullResult(): Promise<ServiceResult<any[]>> {
  try {
    const data = await getMyTenantUsdtOrdersFull();
    return ok(data);
  } catch (error) {
    return mapTenantError(error);
  }
}

export async function createTenantWithAdminResult(
  params: CreateTenantWithAdminParams
): Promise<ServiceResult<{ tenantId?: string; adminEmployeeId?: string }>> {
  try {
    const result = await createTenantWithAdmin(params);
    if (!result.success) {
      return fail((result.errorCode as any) || "UNKNOWN", result.errorCode || "Create tenant failed", "TENANT");
    }
    return ok({ tenantId: result.tenantId, adminEmployeeId: result.adminEmployeeId });
  } catch (error) {
    return mapTenantError(error);
  }
}

export async function updateTenantBasicInfoResult(params: {
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  status: string;
}): Promise<ServiceResult<void>> {
  try {
    const result = await updateTenantBasicInfo(params);
    if (!result.success) {
      return fail((result.errorCode as any) || "UNKNOWN", result.errorCode || "Update tenant failed", "TENANT");
    }
    return ok(undefined);
  } catch (error) {
    return mapTenantError(error);
  }
}

export async function resetTenantAdminPasswordResult(params: {
  tenantId: string;
  adminEmployeeId?: string | null;
  newPassword: string;
}): Promise<ServiceResult<{ adminEmployeeId?: string; adminUsername?: string; adminRealName?: string }>> {
  try {
    const result = await resetTenantAdminPassword(params);
    if (!result.success) {
      return fail((result.errorCode as any) || "UNKNOWN", result.errorCode || "Reset tenant admin password failed", "TENANT");
    }
    return ok({
      adminEmployeeId: result.adminEmployeeId,
      adminUsername: result.adminUsername,
      adminRealName: result.adminRealName,
    });
  } catch (error) {
    return mapTenantError(error);
  }
}

export async function deleteTenantResult(params: {
  tenantId: string;
  force?: boolean;
  username?: string;
  password?: string;
}): Promise<ServiceResult<{ detail?: string }>> {
  try {
    const result = await deleteTenant(params);
    if (!result.success) {
      return fail((result.errorCode as any) || "UNKNOWN", result.detail || result.errorCode || "Delete tenant failed", "TENANT");
    }
    return ok({ detail: result.detail });
  } catch (error) {
    return mapTenantError(error);
  }
}

export async function setTenantSuperAdminResult(employeeId: string): Promise<ServiceResult<void>> {
  try {
    const result = await setTenantSuperAdmin(employeeId);
    if (!result.success) {
      return fail((result.errorCode as any) || "UNKNOWN", result.errorCode || "Set super admin failed", "TENANT");
    }
    return ok(undefined);
  } catch (error) {
    return mapTenantError(error);
  }
}
