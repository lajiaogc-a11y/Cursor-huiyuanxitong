/**
 * Tenant shared types
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
  name: string;
  admin_username: string;
  admin_password: string;
  admin_real_name: string;
}

export interface UpdateTenantBody {
  name?: string;
  status?: 'active' | 'disabled';
}
