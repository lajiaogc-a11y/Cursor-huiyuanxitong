/**
 * Tenant shared types — 与后端 controller 的 body 字段严格对齐
 */

export interface Tenant {
  id: string;
  name: string;
  status: 'active' | 'disabled';
  admin_user_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreateTenantBody {
  tenantCode: string;
  tenantName: string;
  adminUsername: string;
  adminRealName: string;
  adminPassword: string;
}

export interface UpdateTenantBody {
  tenantCode?: string;
  tenantName?: string;
  status?: string;
}
