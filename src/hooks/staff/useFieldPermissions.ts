// ============= Field Permissions Hook =============
// 字段权限检查 Hook - 使用 AuthContext 中预加载的权限数据
// 权限数据由 AuthContext 统一加载和订阅，无需独立缓存
// 性能优化：添加权限结果缓存，避免重复计算

import { useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { resolvePermissionRole } from '@/lib/permissionModels';

export interface FieldPermission {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

// 🔧 性能优化：权限结果缓存Key类型
interface PermissionCacheEntry {
  permission: FieldPermission;
  permissionsVersion: number;
}

// 字段名到数据库字段名的映射
const FIELD_NAME_MAP: Record<string, Record<string, string>> = {
  members: {
    phone_number: 'phone_number',
    /** 会员门户昵称/展示名（与 MemberSettings 一致） */
    nickname: 'nickname',
    member_level: 'member_level',
    common_cards: 'common_cards',
    bank_card: 'bank_card',
    currency_preferences: 'currency_preferences',
    customer_feature: 'customer_feature',
    source: 'source',
    remark: 'remark',
    referrer: 'referrer',
    recorder: 'recorder',
    member_code: 'member_code',
    points: 'points',
    delete_button: 'delete_button',
  },
  orders: {
    card_type: 'card_type',
    card_value: 'card_value',
    card_rate: 'card_rate',
    actual_payment: 'actual_payment',
    exchange_rate: 'exchange_rate',
    fee: 'fee',
    currency: 'currency',
    phone_number: 'phone_number',
    payment_provider: 'payment_provider',
    vendor: 'vendor',
    remark: 'remark',
    member_code: 'member_code',
    sales_person: 'sales_person',
    cancel_button: 'cancel_button',
    delete_button: 'delete_button',
    batch_delete: 'batch_delete',
    batch_process: 'batch_process',
  },
  activity: {
    currency: 'currency',
    amount: 'amount',
    rate: 'rate',
    phone_number: 'phone_number',
    payment_agent: 'payment_agent',
    gift_type: 'gift_type',
    remark: 'remark',
    delete_button: 'delete_button',
  },
  audit: {
    can_approve: 'can_approve',
    require_approval: 'require_approval',
  },
  data_management: {
    import_data: 'import_data',
    export_data: 'export_data',
    batch_delete: 'batch_delete',
    batch_action: 'batch_action',
  },
  merchant_settlement: {
    view_card_settlement: 'view_card_settlement',
    view_provider_settlement: 'view_provider_settlement',
    view_shift_data: 'view_shift_data',
    edit_balance: 'edit_balance',
    export_data: 'export_data',
  },
  merchant_management: {
    view_cards: 'view_cards',
    edit_cards: 'edit_cards',
    delete_cards: 'delete_cards',
    view_vendors: 'view_vendors',
    edit_vendors: 'edit_vendors',
    delete_vendors: 'delete_vendors',
    view_providers: 'view_providers',
    edit_providers: 'edit_providers',
    delete_providers: 'delete_providers',
  },
  knowledge_base: {
    view_articles: 'view_articles',
    create_articles: 'create_articles',
    edit_articles: 'edit_articles',
    delete_articles: 'delete_articles',
    manage_categories: 'manage_categories',
    create_public_categories: 'create_public_categories',
  },
  error_reports: {
    delete_report: 'delete_report',
    batch_clear: 'batch_clear',
  },
};

export function useFieldPermissions() {
  const { employee, permissions, permissionsLoaded } = useAuth();
  
  // 🔧 性能优化：权限结果缓存
  const permissionCacheRef = useRef<Map<string, PermissionCacheEntry>>(new Map());
  const permissionsVersionRef = useRef(0);
  
  // 权限数据变化时更新版本号
  useMemo(() => {
    permissionsVersionRef.current += 1;
  }, []);

  // 检查指定模块和字段的权限（带缓存）
  const checkPermission = useCallback((moduleName: string, fieldName: string): FieldPermission => {
    if (!employee) {
      return { canView: false, canEdit: false, canDelete: false };
    }

    if (employee.is_platform_super_admin) {
      return { canView: true, canEdit: true, canDelete: true };
    }

    const permRole = resolvePermissionRole(employee);
    
    // 检查缓存
    const cacheKey = `${permRole}:${moduleName}:${fieldName}`;
    const cached = permissionCacheRef.current.get(cacheKey);
    if (cached && cached.permissionsVersion === permissionsVersionRef.current) {
      return cached.permission;
    }

    // 查找对应的权限记录
    const permission = permissions.find(
      (p) => p.role === permRole && p.module_name === moduleName && p.field_name === fieldName,
    );

    const isIsolatedBatchField =
      (moduleName === 'orders' && (fieldName === 'batch_delete' || fieldName === 'batch_process')) ||
      (moduleName === 'data_management' && (fieldName === 'batch_delete' || fieldName === 'batch_action')) ||
      (moduleName === 'error_reports' && fieldName === 'batch_clear');

    let result: FieldPermission;
    if (permission) {
      result = {
        canView: permission.can_view,
        canEdit: permission.can_edit,
        canDelete: permission.can_delete,
      };
    } else if (isIsolatedBatchField) {
      /** 批量类权限：无库行时默认全关，不沿用管理员「全开」回退 */
      result = { canView: false, canEdit: false, canDelete: false };
    } else {
      if (permRole === 'admin' || permRole === 'super_admin') {
        result = { canView: true, canEdit: true, canDelete: true };
      } else if (permRole === 'manager') {
        result = { canView: true, canEdit: true, canDelete: false };
      } else {
        result = { canView: true, canEdit: false, canDelete: false };
      }
    }
    
    // 缓存结果
    permissionCacheRef.current.set(cacheKey, {
      permission: result,
      permissionsVersion: permissionsVersionRef.current,
    });
    
    return result;
  }, [employee, permissions]);

  // 批量获取模块的所有字段权限（带缓存）
  const getModulePermissions = useCallback((moduleName: string): Record<string, FieldPermission> => {
    const fieldMap = FIELD_NAME_MAP[moduleName] || {};
    const result: Record<string, FieldPermission> = {};
    
    for (const fieldName of Object.keys(fieldMap)) {
      result[fieldName] = checkPermission(moduleName, fieldName);
    }
    
    return result;
  }, [checkPermission]);

  // 检查是否需要审核（当没有直接编辑权限时需要审核）
  const needsApproval = useCallback((moduleName: string, fieldName: string): boolean => {
    if (!employee) return false;
    if (employee.is_platform_super_admin) return false;
    const permRole = resolvePermissionRole(employee);
    if (permRole === 'admin' || permRole === 'super_admin') return false;

    const permission = permissions.find(
      (p) => p.role === permRole && p.module_name === moduleName && p.field_name === fieldName,
    );

    if (permission) {
      return !permission.can_edit;
    }

    return permRole === 'staff';
  }, [employee, permissions]);

  return {
    permissions,
    loading: !permissionsLoaded,
    checkPermission,
    getModulePermissions,
    needsApproval,
    refetch: () => {}, // 权限由 AuthContext 自动订阅更新
    invalidateCache: () => {}, // 无需手动清除缓存
    currentRole: employee?.role,
  };
}

// 便捷 hook - 检查单个字段权限
export function useFieldPermission(moduleName: string, fieldName: string): FieldPermission & { needsApproval: boolean; loading: boolean } {
  const { checkPermission, needsApproval, loading } = useFieldPermissions();
  
  const permission = checkPermission(moduleName, fieldName);
  const requiresApproval = needsApproval(moduleName, fieldName);

  return {
    ...permission,
    needsApproval: requiresApproval,
    loading,
  };
}

// 便捷 hook - 获取模块的所有字段权限
export function useModulePermissions(moduleName: string) {
  const { getModulePermissions, loading, currentRole } = useFieldPermissions();
  
  const permissions = useMemo(() => getModulePermissions(moduleName), [getModulePermissions, moduleName]);

  return {
    permissions,
    loading,
    currentRole,
    // 便捷方法
    canViewField: (fieldName: string) => permissions[fieldName]?.canView ?? true,
    canEditField: (fieldName: string) => permissions[fieldName]?.canEdit ?? false,
    canDeleteField: (fieldName: string) => permissions[fieldName]?.canDelete ?? false,
  };
}
