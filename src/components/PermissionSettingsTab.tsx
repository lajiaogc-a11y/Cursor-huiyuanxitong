import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Save, ChevronDown, ChevronRight, Wand2, Plus, Pencil, Trash2, Settings2, MoreHorizontal } from "lucide-react";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { useAuditLog } from "@/hooks/useAuditLog";
import { loadSharedData, saveSharedData, type SharedDataKey } from "@/services/sharedDataService";
import { usePermissionChangeLogs } from "@/hooks/usePermissionChangeLogs";
import { PermissionChangeHistory } from "@/components/PermissionChangeHistory";
import { PermissionImportExport } from "@/components/PermissionImportExport";
import { PermissionVersionManager } from "@/components/PermissionVersionManager";
import { PermissionVersionCompare } from "@/components/PermissionVersionCompare";
import { usePermissionVersions } from "@/hooks/usePermissionVersions";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

type AppRole = "admin" | "manager" | "staff";

interface RolePermission {
  id: string;
  role: AppRole;
  module_name: string;
  field_name: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

// Custom template interface
interface CustomTemplate {
  id: string;
  name_zh: string;
  name_en: string;
  description_zh: string;
  description_en: string;
  settings: { can_view: boolean; can_edit: boolean; can_delete: boolean };
  createdAt: string;
}

// Module and field definitions with Chinese/English labels
const MODULES = {
  orders: {
    label_zh: "订单管理",
    label_en: "Order Management",
    fields: {
      card_type: { label_zh: "卡片类型", label_en: "Card Type" },
      card_value: { label_zh: "卡片面值", label_en: "Card Value" },
      card_rate: { label_zh: "卡片汇率", label_en: "Card Rate" },
      actual_payment: { label_zh: "实付外币", label_en: "Actual Payment" },
      exchange_rate: { label_zh: "外币汇率", label_en: "Exchange Rate" },
      fee: { label_zh: "手续费", label_en: "Fee" },
      currency: { label_zh: "需求币种", label_en: "Currency" },
      phone_number: { label_zh: "电话号码", label_en: "Phone Number" },
      payment_provider: { label_zh: "代付商家", label_en: "Payment Provider" },
      vendor: { label_zh: "卡商", label_en: "Vendor" },
      remark: { label_zh: "备注", label_en: "Remark" },
      member_code: { label_zh: "会员编号", label_en: "Member Code", readonly: true },
      sales_person: { label_zh: "销售员", label_en: "Sales Person", readonly: true },
      cancel_button: { label_zh: "取消订单", label_en: "Cancel Order", isAction: true },
      delete_button: { label_zh: "删除订单", label_en: "Delete Order", isAction: true },
    },
  },
  members: {
    label_zh: "会员管理",
    label_en: "Member Management",
    fields: {
      phone_number: { label_zh: "手机号", label_en: "Phone Number" },
      member_level: { label_zh: "等级", label_en: "Level" },
      common_cards: { label_zh: "常交易卡", label_en: "Common Cards" },
      bank_card: { label_zh: "银行卡", label_en: "Bank Card" },
      currency_preferences: { label_zh: "币种偏好", label_en: "Currency Preferences" },
      customer_feature: { label_zh: "客户特点", label_en: "Customer Feature" },
      source: { label_zh: "来源", label_en: "Source" },
      remark: { label_zh: "备注", label_en: "Remark" },
      referrer: { label_zh: "推荐人", label_en: "Referrer" },
      recorder: { label_zh: "录入人", label_en: "Recorder" },
      member_code: { label_zh: "会员编号", label_en: "Member Code", readonly: true },
      points: { label_zh: "修改积分", label_en: "Modify Points" },
      delete_button: { label_zh: "删除会员", label_en: "Delete Member", isAction: true },
    },
  },
  activity: {
    label_zh: "活动赠送",
    label_en: "Activity Gifts",
    fields: {
      currency: { label_zh: "赠送币种", label_en: "Gift Currency" },
      amount: { label_zh: "赠送金额", label_en: "Gift Amount" },
      rate: { label_zh: "汇率", label_en: "Rate" },
      phone_number: { label_zh: "电话号码", label_en: "Phone Number" },
      payment_agent: { label_zh: "代付商家", label_en: "Payment Agent" },
      gift_type: { label_zh: "类型", label_en: "Type" },
      remark: { label_zh: "备注", label_en: "Remark" },
      delete_button: { label_zh: "删除活动", label_en: "Delete Activity", isAction: true },
    },
  },
  navigation: {
    label_zh: "导航菜单可见性",
    label_en: "Navigation Visibility",
    fields: {
      dashboard: { label_zh: "数据统计", label_en: "Statistics" },
      exchange_rate: { label_zh: "汇率计算", label_en: "Exchange Rate" },
      orders: { label_zh: "订单管理", label_en: "Orders" },
      reports: { label_zh: "报表管理", label_en: "Reports" },
      activity_reports: { label_zh: "活动报表", label_en: "Activity Reports" },
      members: { label_zh: "会员管理", label_en: "Members" },
      employees: { label_zh: "员工管理", label_en: "Employees" },
      merchant_settlement: { label_zh: "商家结算", label_en: "Merchant Settlement" },
      merchant_management: { label_zh: "商家管理", label_en: "Merchant Management" },
      system_settings: { label_zh: "系统设置", label_en: "System Settings" },
      audit_center: { label_zh: "审核中心", label_en: "Audit Center" },
      operation_logs: { label_zh: "操作日志", label_en: "Operation Logs" },
      login_logs: { label_zh: "登录日志", label_en: "Login Logs" },
      knowledge_base: { label_zh: "公司文档", label_en: "Company Docs" },
    },
  },
  dashboard: {
    label_zh: "数据统计数据",
    label_en: "Statistics Data",
    fields: {
      own_data_only: { label_zh: "仅显示自己的数据", label_en: "Show Own Data Only" },
    },
  },
  audit: {
    label_zh: "审核中心",
    label_en: "Audit Center",
    fields: {
      can_approve: { label_zh: "审核权限", label_en: "Approve Permission" },
      require_approval: { label_zh: "修改需审核", label_en: "Require Approval" },
    },
  },
  // New modules
  login_logs: {
    label_zh: "登录日志",
    label_en: "Login Logs",
    fields: {
      view_all_logs: { label_zh: "查看所有日志", label_en: "View All Logs" },
      export_logs: { label_zh: "导出日志", label_en: "Export Logs" },
    },
  },
  activity_reports: {
    label_zh: "活动报表",
    label_en: "Activity Reports",
    fields: {
      view_member_data: { label_zh: "查看会员数据", label_en: "View Member Data" },
      view_activity_data: { label_zh: "查看活动数据", label_en: "View Activity Data" },
      view_points_details: { label_zh: "查看积分明细", label_en: "View Points Details" },
      adjust_points: { label_zh: "调整积分", label_en: "Adjust Points" },
      redeem_points: { label_zh: "积分兑换", label_en: "Redeem Points" },
    },
  },
  referral: {
    label_zh: "推荐管理",
    label_en: "Referral Management",
    fields: {
      view_referrals: { label_zh: "查看推荐关系", label_en: "View Referrals" },
      edit_referrals: { label_zh: "编辑推荐", label_en: "Edit Referrals" },
      delete_button: { label_zh: "删除推荐", label_en: "Delete Referral", isAction: true },
    },
  },
  shift_handover: {
    label_zh: "交班对账",
    label_en: "Shift Handover",
    fields: {
      view_handover: { label_zh: "查看交班记录", label_en: "View Handover" },
      create_handover: { label_zh: "创建交班", label_en: "Create Handover" },
      confirm_handover: { label_zh: "确认交班", label_en: "Confirm Handover" },
      delete_button: { label_zh: "删除交班", label_en: "Delete Handover", isAction: true },
    },
  },
  data_management: {
    label_zh: "数据管理",
    label_en: "Data Management",
    fields: {
      import_data: { label_zh: "导入数据", label_en: "Import Data" },
      export_data: { label_zh: "导出数据", label_en: "Export Data" },
      batch_delete: { label_zh: "批量删除", label_en: "Batch Delete", isAction: true },
    },
  },
  merchant_settlement: {
    label_zh: "商家结算",
    label_en: "Merchant Settlement",
    fields: {
      view_card_settlement: { label_zh: "查看卡商结算", label_en: "View Card Settlement" },
      view_provider_settlement: { label_zh: "查看代付结算", label_en: "View Provider Settlement" },
      view_shift_data: { label_zh: "查看交班数据", label_en: "View Shift Data" },
      edit_balance: { label_zh: "编辑余额", label_en: "Edit Balance" },
      export_data: { label_zh: "导出数据", label_en: "Export Data" },
    },
  },
  merchant_management: {
    label_zh: "商家管理",
    label_en: "Merchant Management",
    fields: {
      view_cards: { label_zh: "查看卡片", label_en: "View Cards" },
      edit_cards: { label_zh: "编辑卡片", label_en: "Edit Cards" },
      delete_cards: { label_zh: "删除卡片", label_en: "Delete Cards", isAction: true },
      view_vendors: { label_zh: "查看卡商", label_en: "View Vendors" },
      edit_vendors: { label_zh: "编辑卡商", label_en: "Edit Vendors" },
      delete_vendors: { label_zh: "删除卡商", label_en: "Delete Vendors", isAction: true },
      view_providers: { label_zh: "查看代付商家", label_en: "View Providers" },
      edit_providers: { label_zh: "编辑代付商家", label_en: "Edit Providers" },
      delete_providers: { label_zh: "删除代付商家", label_en: "Delete Providers", isAction: true },
    },
  },
  knowledge_base: {
    label_zh: "公司文档",
    label_en: "Company Docs",
    fields: {
      view_articles: { label_zh: "查看文章", label_en: "View Articles" },
      create_articles: { label_zh: "创建文章", label_en: "Create Articles" },
      edit_articles: { label_zh: "编辑文章", label_en: "Edit Articles" },
      delete_articles: { label_zh: "删除文章", label_en: "Delete Articles", isAction: true },
      manage_categories: { label_zh: "管理分类", label_en: "Manage Categories" },
      create_public_categories: { label_zh: "创建公开分类", label_en: "Create Public Categories" },
    },
  },
};

// Built-in permission preset templates
const BUILT_IN_TEMPLATES = {
  readonly: {
    label_zh: "只读模式",
    label_en: "Read-Only Mode",
    description_zh: "只能查看，不能编辑或删除任何数据",
    description_en: "Can only view, cannot edit or delete any data",
    settings: { can_view: true, can_edit: false, can_delete: false },
  },
  full_access: {
    label_zh: "完全访问",
    label_en: "Full Access",
    description_zh: "拥有查看、编辑、删除的全部权限",
    description_en: "Full view, edit, and delete permissions",
    settings: { can_view: true, can_edit: true, can_delete: true },
  },
  entry_only: {
    label_zh: "仅录入",
    label_en: "Entry Only",
    description_zh: "可以查看和编辑，但不能删除",
    description_en: "Can view and edit, but cannot delete",
    settings: { can_view: true, can_edit: true, can_delete: false },
  },
  view_and_delete: {
    label_zh: "查看与删除",
    label_en: "View & Delete",
    description_zh: "可以查看和删除，但不能编辑",
    description_en: "Can view and delete, but cannot edit",
    settings: { can_view: true, can_edit: false, can_delete: true },
  },
  no_access: {
    label_zh: "无访问权限",
    label_en: "No Access",
    description_zh: "不可查看、编辑或删除任何数据",
    description_en: "Cannot view, edit, or delete any data",
    settings: { can_view: false, can_edit: false, can_delete: false },
  },
};

// Helper to get permission for a specific role/module/field
function getPermission(
  permissions: RolePermission[],
  role: AppRole,
  module: string,
  field: string
): RolePermission | undefined {
  return permissions.find(
    (p) => p.role === role && p.module_name === module && p.field_name === field
  );
}

// Export for use in other components - check if user can perform action
// 注意：总管理员（is_super_admin）在调用此函数前应单独检查，此函数不处理总管理员逻辑
export async function checkPermission(
  module: string,
  field: string,
  role: AppRole,
  action: "view" | "edit" | "delete" = "edit"
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("role_permissions")
      .select("can_view, can_edit, can_delete")
      .eq("role", role)
      .eq("module_name", module)
      .eq("field_name", field)
      .single();

    // 如果没有配置权限记录
    if (error || !data) {
      // 管理员默认拥有所有权限
      if (role === "admin") return true;
      // 主管默认拥有查看和编辑权限
      if (role === "manager") return action !== "delete";
      // 员工默认只有查看权限
      return action === "view";
    }

    switch (action) {
      case "view":
        return data.can_view;
      case "edit":
        return data.can_edit;
      case "delete":
        return data.can_delete;
      default:
        return false;
    }
  } catch {
    // 出错时回退到默认权限
    if (role === "admin") return true;
    if (role === "manager") return action !== "delete";
    return action === "view";
  }
}

// Sync version for immediate checks (uses cached data)
let cachedPermissions: RolePermission[] = [];

export function checkPermissionSync(
  module: string,
  field: string,
  role: AppRole,
  action: "view" | "edit" | "delete" = "edit"
): boolean {
  const permission = cachedPermissions.find(
    (p) => p.role === role && p.module_name === module && p.field_name === field
  );

  // 如果没有配置权限记录
  if (!permission) {
    // 管理员默认拥有所有权限
    if (role === "admin") return true;
    // 主管默认拥有查看和编辑权限
    if (role === "manager") return action !== "delete";
    // 员工默认只有查看权限
    return action === "view";
  }

  switch (action) {
    case "view":
      return permission.can_view;
    case "edit":
      return permission.can_edit;
    case "delete":
      return permission.can_delete;
    default:
      return false;
  }
}

export default function PermissionSettingsTab() {
  const { t } = useLanguage();
  const { employee } = useAuth();

  // 仅管理员可访问，员工和主管不可见、不可操作
  if (employee?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Shield className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">{t("权限不足", "Access Denied")}</p>
        <p className="text-sm mt-1">{t("仅管理员可访问权限设置", "Only administrators can access permission settings")}</p>
      </div>
    );
  }
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({
    orders: true,
    members: false,
    activity: false,
    navigation: false,
    dashboard: false,
    audit: false,
    login_logs: false,
    activity_reports: false,
    referral: false,
    shift_handover: false,
    data_management: false,
    merchant_settlement: false,
    merchant_management: false,
    knowledge_base: false,
  });
  const [selectedRole, setSelectedRole] = useState<"staff" | "manager" | "admin">("staff");
  
  // Custom templates state
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CustomTemplate | null>(null);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState({
    name_zh: "",
    name_en: "",
    description_zh: "",
    description_en: "",
    can_view: true,
    can_edit: false,
    can_delete: false,
  });

  // Permission change logs hook
  const { createLog } = usePermissionChangeLogs();
  
  // Permission versions hook for auto-backup
  const { createVersion, versions, fetchVersions } = usePermissionVersions();
  
  // Track original permissions for change detection
  const originalPermissionsRef = useRef<RolePermission[]>([]);
  
  // Auto backup setting
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);

  useEffect(() => {
    fetchPermissions();
    loadCustomTemplates();
    fetchVersions(selectedRole);
  }, []);

  // Fetch versions when role changes
  useEffect(() => {
    fetchVersions(selectedRole);
  }, [selectedRole, fetchVersions]);

  const fetchPermissions = async () => {
    try {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("*")
        .order("module_name", { ascending: true });

      if (error) throw error;
      
      const typedData = (data || []) as RolePermission[];
      setPermissions(typedData);
      cachedPermissions = typedData;
      originalPermissionsRef.current = JSON.parse(JSON.stringify(typedData));
    } catch (error) {
      console.error("Failed to fetch permissions:", error);
      toast.error(t("加载权限设置失败", "Failed to load permissions"));
    } finally {
      setLoading(false);
    }
  };

  const loadCustomTemplates = async () => {
    try {
      const templates = await loadSharedData<CustomTemplate[]>("customPermissionTemplates" as SharedDataKey);
      setCustomTemplates(templates || []);
    } catch (error) {
      console.error("Failed to load custom templates:", error);
    }
  };

  const saveCustomTemplates = async (templates: CustomTemplate[]) => {
    try {
      await saveSharedData("customPermissionTemplates" as SharedDataKey, templates);
      setCustomTemplates(templates);
    } catch (error) {
      console.error("Failed to save custom templates:", error);
      throw error;
    }
  };

  const handlePermissionChange = async (
    role: AppRole,
    module: string,
    field: string,
    key: "can_view" | "can_edit" | "can_delete",
    value: boolean
  ) => {
    const existing = getPermission(permissions, role, module, field);

    if (existing) {
      // Update existing
      setPermissions((prev) =>
        prev.map((p) =>
          p.id === existing.id ? { ...p, [key]: value } : p
        )
      );
    } else {
      // Create new (will be saved on submit)
      const newPerm: RolePermission = {
        id: `temp-${Date.now()}`,
        role,
        module_name: module,
        field_name: field,
        can_view: key === "can_view" ? value : true,
        can_edit: key === "can_edit" ? value : false,
        can_delete: key === "can_delete" ? value : false,
      };
      setPermissions((prev) => [...prev, newPerm]);
    }
    setHasChanges(true);
  };

  const { logUpdate, logCreate } = useAuditLog('system_settings');

  const handleSave = async () => {
    try {
      // Auto-backup: Create a backup version before saving if enabled and there are actual changes
      const rolePermissions = permissions.filter(p => p.role === selectedRole);
      const originalRolePerms = originalPermissionsRef.current.filter(p => p.role === selectedRole);
      
      // Calculate changes for logging
      const changesSummary: Array<{
        module: string;
        field: string;
        before: { can_view: boolean; can_edit: boolean; can_delete: boolean };
        after: { can_view: boolean; can_edit: boolean; can_delete: boolean };
      }> = [];

      for (const perm of rolePermissions) {
        const original = originalRolePerms.find(
          p => p.module_name === perm.module_name && p.field_name === perm.field_name
        );
        
        if (!original || 
            original.can_view !== perm.can_view ||
            original.can_edit !== perm.can_edit ||
            original.can_delete !== perm.can_delete) {
          changesSummary.push({
            module: perm.module_name,
            field: perm.field_name,
            before: original ? {
              can_view: original.can_view,
              can_edit: original.can_edit,
              can_delete: original.can_delete,
            } : { can_view: false, can_edit: false, can_delete: false },
            after: {
              can_view: perm.can_view,
              can_edit: perm.can_edit,
              can_delete: perm.can_delete,
            },
          });
        }
      }

      // Auto-backup before saving if there are changes
      if (autoBackupEnabled && changesSummary.length > 0 && originalRolePerms.length > 0) {
        const backupSnapshot = originalRolePerms.map(p => ({
          module_name: p.module_name,
          field_name: p.field_name,
          can_view: p.can_view,
          can_edit: p.can_edit,
          can_delete: p.can_delete,
        }));

        const roleLabel = selectedRole === 'admin' ? '管理员' : selectedRole === 'manager' ? '主管' : '员工';
        const backupName = `[自动备份] ${roleLabel} - ${format(new Date(), 'yyyy-MM-dd HH:mm')}`;
        
        await createVersion({
          versionName: backupName,
          versionDescription: `保存前自动创建的备份，包含 ${changesSummary.length} 处即将变更的权限`,
          targetRole: selectedRole,
          permissionsSnapshot: backupSnapshot,
          isAutoBackup: true,
        });
      }
      
      // 批量处理：分离新增和更新
      const toInsert = permissions.filter(p => p.id.startsWith("temp-"));
      const toUpdate = permissions.filter(p => !p.id.startsWith("temp-"));

      // 批量 upsert 新权限（使用 role + module_name + field_name 作为唯一键）
      if (toInsert.length > 0) {
        const insertData = toInsert.map(perm => ({
          role: perm.role,
          module_name: perm.module_name,
          field_name: perm.field_name,
          can_view: perm.can_view,
          can_edit: perm.can_edit,
          can_delete: perm.can_delete,
        }));
        
        // Use upsert to prevent duplicate key errors
        const { error } = await supabase
          .from("role_permissions")
          .upsert(insertData, {
            onConflict: 'role,module_name,field_name',
            ignoreDuplicates: false,
          });
        
        if (error) throw error;
      }

      // 批量更新现有权限 - 使用 Promise.all 并行处理
      if (toUpdate.length > 0) {
        const updatePromises = toUpdate.map(perm =>
          supabase
            .from("role_permissions")
            .update({
              can_view: perm.can_view,
              can_edit: perm.can_edit,
              can_delete: perm.can_delete,
            })
            .eq("id", perm.id)
        );
        const results = await Promise.all(updatePromises);
        const errors = results.filter(r => r.error);
        if (errors.length > 0) throw errors[0].error;
      }

      // Log permission changes
      if (changesSummary.length > 0) {
        await createLog({
          targetRole: selectedRole,
          actionType: 'update',
          changesSummary,
        });
      }

      toast.success(t("权限设置已保存", "Permission settings saved"));
      setHasChanges(false);
      fetchPermissions();
    } catch (error) {
      console.error("Failed to save permissions:", error);
      toast.error(t("保存权限设置失败", "Failed to save permissions"));
    }
  };

  // Apply template (works for both built-in and custom templates)
  const applyTemplate = useCallback(async (templateSettings: { can_view: boolean; can_edit: boolean; can_delete: boolean }, templateName: string) => {
    const { can_view, can_edit, can_delete } = templateSettings;

    const newPermissions: RolePermission[] = [];
    const changesSummary: Array<{
      module: string;
      field: string;
      before: { can_view: boolean; can_edit: boolean; can_delete: boolean };
      after: { can_view: boolean; can_edit: boolean; can_delete: boolean };
    }> = [];
    
    // Iterate through all modules and fields
    Object.entries(MODULES).forEach(([moduleKey, moduleConfig]) => {
      Object.entries(moduleConfig.fields).forEach(([fieldKey, fieldConfig]) => {
        // Type assertion to access optional properties
        const config = fieldConfig as { label_zh: string; label_en: string; readonly?: boolean; isAction?: boolean };
        // Skip readonly fields for edit permission
        const effectiveEdit = config.readonly ? false : can_edit;
        // Only action fields support delete
        const effectiveDelete = config.isAction ? can_delete : false;
        
        const existing = getPermission(permissions, selectedRole, moduleKey, fieldKey);
        const original = originalPermissionsRef.current.find(
          p => p.role === selectedRole && p.module_name === moduleKey && p.field_name === fieldKey
        );
        
        // Track changes
        if (!original ||
            original.can_view !== can_view ||
            original.can_edit !== effectiveEdit ||
            original.can_delete !== effectiveDelete) {
          changesSummary.push({
            module: moduleKey,
            field: fieldKey,
            before: original ? {
              can_view: original.can_view,
              can_edit: original.can_edit,
              can_delete: original.can_delete,
            } : { can_view: false, can_edit: false, can_delete: false },
            after: {
              can_view,
              can_edit: effectiveEdit,
              can_delete: effectiveDelete,
            },
          });
        }
        
        if (existing) {
          // Update existing permission
          newPermissions.push({
            ...existing,
            can_view,
            can_edit: effectiveEdit,
            can_delete: effectiveDelete,
          });
        } else {
          // Create new permission
          newPermissions.push({
            id: `temp-${Date.now()}-${moduleKey}-${fieldKey}`,
            role: selectedRole,
            module_name: moduleKey,
            field_name: fieldKey,
            can_view,
            can_edit: effectiveEdit,
            can_delete: effectiveDelete,
          });
        }
      });
    });

    // Merge with existing permissions for other roles
    setPermissions((prev) => {
      const otherRolePermissions = prev.filter((p) => p.role !== selectedRole);
      return [...otherRolePermissions, ...newPermissions];
    });

    setHasChanges(true);
    
    // Log template application (will be saved when user clicks save)
    toast.success(t(
      `已应用"${templateName}"模板，请点击保存以确认更改`,
      `Applied "${templateName}" template. Click Save to confirm changes.`
    ));
  }, [permissions, selectedRole, t]);

  const toggleModule = (module: string) => {
    setExpandedModules((prev) => ({
      ...prev,
      [module]: !prev[module],
    }));
  };

  // Template management functions
  const handleOpenTemplateDialog = (template?: CustomTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setTemplateForm({
        name_zh: template.name_zh,
        name_en: template.name_en,
        description_zh: template.description_zh,
        description_en: template.description_en,
        can_view: template.settings.can_view,
        can_edit: template.settings.can_edit,
        can_delete: template.settings.can_delete,
      });
    } else {
      setEditingTemplate(null);
      setTemplateForm({
        name_zh: "",
        name_en: "",
        description_zh: "",
        description_en: "",
        can_view: true,
        can_edit: false,
        can_delete: false,
      });
    }
    setShowTemplateDialog(true);
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.name_zh.trim() || !templateForm.name_en.trim()) {
      toast.error(t("请填写模板名称", "Please enter template name"));
      return;
    }

    try {
      const newTemplate: CustomTemplate = {
        id: editingTemplate?.id || `custom-${Date.now()}`,
        name_zh: templateForm.name_zh.trim(),
        name_en: templateForm.name_en.trim(),
        description_zh: templateForm.description_zh.trim(),
        description_en: templateForm.description_en.trim(),
        settings: {
          can_view: templateForm.can_view,
          can_edit: templateForm.can_edit,
          can_delete: templateForm.can_delete,
        },
        createdAt: editingTemplate?.createdAt || new Date().toISOString(),
      };

      let updatedTemplates: CustomTemplate[];
      if (editingTemplate) {
        updatedTemplates = customTemplates.map(t => t.id === editingTemplate.id ? newTemplate : t);
      } else {
        updatedTemplates = [...customTemplates, newTemplate];
      }

      await saveCustomTemplates(updatedTemplates);
      setShowTemplateDialog(false);
      toast.success(t(
        editingTemplate ? "模板已更新" : "模板已创建",
        editingTemplate ? "Template updated" : "Template created"
      ));
    } catch (error) {
      console.error("Failed to save template:", error);
      toast.error(t("保存模板失败", "Failed to save template"));
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deleteTemplateId) return;

    try {
      const updatedTemplates = customTemplates.filter(t => t.id !== deleteTemplateId);
      await saveCustomTemplates(updatedTemplates);
      setDeleteTemplateId(null);
      toast.success(t("模板已删除", "Template deleted"));
    } catch (error) {
      console.error("Failed to delete template:", error);
      toast.error(t("删除模板失败", "Failed to delete template"));
    }
  };

  const renderFieldRow = (
    module: string,
    fieldKey: string,
    fieldConfig: { label_zh: string; label_en: string; readonly?: boolean; isAction?: boolean }
  ) => {
    const permission = getPermission(permissions, selectedRole, module, fieldKey);
    const canView = permission?.can_view ?? true;
    const canEdit = permission?.can_edit ?? false;
    const canDelete = permission?.can_delete ?? false;

    return (
      <div
        key={`${module}-${fieldKey}`}
        className={useCompactLayout 
          ? "py-2.5 px-3 border-b last:border-b-0 hover:bg-muted/50 space-y-2"
          : "flex items-center justify-between py-2 px-3 border-b last:border-b-0 hover:bg-muted/50"
        }
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">{t(fieldConfig.label_zh, fieldConfig.label_en)}</span>
          {fieldConfig.readonly && (
            <Badge variant="secondary" className="text-xs">
              {t("只读", "Read-only")}
            </Badge>
          )}
          {fieldConfig.isAction && (
            <Badge variant="outline" className="text-xs">
              {t("操作", "Action")}
            </Badge>
          )}
        </div>
        <div className={useCompactLayout ? "flex flex-wrap items-center gap-3 pl-1" : "flex items-center gap-4"}>
          {module === "navigation" || module === "dashboard" ? (
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">{t("可见", "Visible")}</Label>
              <Switch
                checked={canView}
                onCheckedChange={(v) =>
                  handlePermissionChange(selectedRole, module, fieldKey, "can_view", v)
                }
              />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">{t("可查看", "View")}</Label>
                <Switch
                  checked={canView}
                  onCheckedChange={(v) =>
                    handlePermissionChange(selectedRole, module, fieldKey, "can_view", v)
                  }
                />
              </div>
              {!fieldConfig.readonly && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">{t("可编辑", "Edit")}</Label>
                  <Switch
                    checked={canEdit}
                    onCheckedChange={(v) =>
                      handlePermissionChange(selectedRole, module, fieldKey, "can_edit", v)
                    }
                  />
                </div>
              )}
              {fieldConfig.isAction && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">{t("可删除", "Delete")}</Label>
                  <Switch
                    checked={canDelete}
                    onCheckedChange={(v) =>
                      handlePermissionChange(selectedRole, module, fieldKey, "can_delete", v)
                    }
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t("加载中...", "Loading...")}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          <div className={useCompactLayout ? "space-y-3" : "flex items-center justify-between"}>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {t("权限设置", "Permission Settings")}
            </CardTitle>
            <div className={useCompactLayout ? "flex flex-wrap items-center gap-2" : "flex items-center gap-3"}>
              {/* Role selector */}
              {useCompactLayout ? (
                <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as "staff" | "manager" | "admin")}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">{t("员工", "Staff")}</SelectItem>
                    <SelectItem value="manager">{t("主管", "Manager")}</SelectItem>
                    <SelectItem value="admin">{t("管理员", "Admin")}</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
                  <Button variant={selectedRole === "staff" ? "default" : "ghost"} size="sm" onClick={() => setSelectedRole("staff")}>{t("员工", "Staff")}</Button>
                  <Button variant={selectedRole === "manager" ? "default" : "ghost"} size="sm" onClick={() => setSelectedRole("manager")}>{t("主管", "Manager")}</Button>
                  <Button variant={selectedRole === "admin" ? "default" : "ghost"} size="sm" onClick={() => setSelectedRole("admin")}>{t("管理员", "Admin")}</Button>
                </div>
              )}
              
              {/* On compact: group action buttons into a "More" dropdown */}
              {useCompactLayout ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => {}}>
                      <PermissionChangeHistory />
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleOpenTemplateDialog()}>
                      <Settings2 className="h-4 w-4 mr-2" />
                      {t("管理模板", "Manage Templates")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <PermissionChangeHistory />
                  <PermissionVersionManager
                    selectedRole={selectedRole}
                    currentPermissions={permissions.map(p => ({
                      role: p.role,
                      module_name: p.module_name,
                      field_name: p.field_name,
                      can_view: p.can_view,
                      can_edit: p.can_edit,
                      can_delete: p.can_delete,
                    }))}
                    onRestore={(restoredPerms) => {
                      const newPermissions = permissions.filter(p => p.role !== selectedRole);
                      const restoredWithIds = restoredPerms.map((p, idx) => ({
                        id: `restored-${Date.now()}-${idx}`,
                        role: selectedRole as AppRole,
                        module_name: p.module_name,
                        field_name: p.field_name,
                        can_view: p.can_view,
                        can_edit: p.can_edit,
                        can_delete: p.can_delete,
                      }));
                      setPermissions([...newPermissions, ...restoredWithIds]);
                      setHasChanges(false);
                      fetchPermissions();
                    }}
                  />
                  <PermissionVersionCompare
                    versions={versions}
                    currentPermissions={permissions
                      .filter(p => p.role === selectedRole)
                      .map(p => ({
                        module_name: p.module_name,
                        field_name: p.field_name,
                        can_view: p.can_view,
                        can_edit: p.can_edit,
                        can_delete: p.can_delete,
                      }))}
                    selectedRole={selectedRole}
                  />
                  <PermissionImportExport onImportComplete={fetchPermissions} />
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => handleOpenTemplateDialog()}>
                    <Settings2 className="h-4 w-4" />
                    {t("管理模板", "Manage Templates")}
                  </Button>
                </>
              )}
              
              {/* Preset Template Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Wand2 className="h-4 w-4" />
                    {!useCompactLayout && t("预设模板", "Templates")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 max-h-96 overflow-y-auto">
                  <DropdownMenuLabel>
                    {t("内置模板", "Built-in Templates")}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {Object.entries(BUILT_IN_TEMPLATES).map(([key, template]) => (
                    <DropdownMenuItem
                      key={key}
                      onClick={() => applyTemplate(template.settings, t(template.label_zh, template.label_en))}
                      className="flex flex-col items-start gap-1 cursor-pointer"
                    >
                      <span className="font-medium">
                        {t(template.label_zh, template.label_en)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t(template.description_zh, template.description_en)}
                      </span>
                    </DropdownMenuItem>
                  ))}
                  
                  {customTemplates.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>
                        {t("自定义模板", "Custom Templates")}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {customTemplates.map((template) => (
                        <DropdownMenuItem
                          key={template.id}
                          className="flex items-center justify-between cursor-pointer group"
                        >
                          <div 
                            className="flex-1 flex flex-col gap-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              applyTemplate(template.settings, t(template.name_zh, template.name_en));
                            }}
                          >
                            <span className="font-medium">
                              {t(template.name_zh, template.name_en)}
                            </span>
                            {template.description_zh && (
                              <span className="text-xs text-muted-foreground">
                                {t(template.description_zh, template.description_en)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenTemplateDialog(template);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTemplateId(template.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Auto-backup Toggle */}
              {!useCompactLayout && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-muted/50">
                  <Switch
                    id="auto-backup"
                    checked={autoBackupEnabled}
                    onCheckedChange={setAutoBackupEnabled}
                  />
                  <Label htmlFor="auto-backup" className="text-xs cursor-pointer">
                    {t("保存前自动备份", "Auto-backup")}
                  </Label>
                </div>
              )}

              {hasChanges && (
                <Button onClick={handleSave} className="gap-2" size={useCompactLayout ? "sm" : "default"}>
                  <Save className="h-4 w-4" />
                  {t("保存", "Save")}
                </Button>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {selectedRole === "admin" 
              ? t(
                  "管理员默认拥有所有权限，此处配置仅用于特殊限制场景。",
                  "Admins have full access by default. Configure here only for special restrictions."
                )
              : t(
                  "配置不同角色对各模块和字段的访问权限。总管理员权限不可修改。",
                  "Configure access permissions for different roles. Super admin permissions cannot be modified."
                )
            }
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(MODULES).map(([moduleKey, moduleConfig]) => (
            <Collapsible
              key={moduleKey}
              open={expandedModules[moduleKey]}
              onOpenChange={() => toggleModule(moduleKey)}
            >
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                <span className="font-medium">
                  {t(moduleConfig.label_zh, moduleConfig.label_en)}
                </span>
                {expandedModules[moduleKey] ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="border rounded-lg mt-2">
                {Object.entries(moduleConfig.fields).map(([fieldKey, fieldConfig]) =>
                  renderFieldRow(moduleKey, fieldKey, fieldConfig)
                )}
              </CollapsibleContent>
            </Collapsible>
          ))}

          {/* Info note */}
          <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-lg space-y-2">
            <p>
              💡 {t(
                "管理员默认拥有全部权限，无需单独配置。",
                "Admins have full permissions by default, no separate configuration needed."
              )}
            </p>
            <p>
              🔒 {t(
                "会员编号和销售员字段永远不可手动修改，只跟随系统逻辑自动生成。",
                "Member code and sales person fields cannot be manually modified."
              )}
            </p>
            <p>
              ⚠️ {t(
                "权限设置与审核中心关系：如果某角色的[可编辑]权限被关闭，该角色的修改将自动进入审核队列等待管理员审批。",
                "Permission vs Audit Center: If Edit permission is disabled for a role, their changes will automatically enter the audit queue for admin approval."
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Template Edit/Create Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingTemplate ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {editingTemplate 
                ? t("编辑模板", "Edit Template")
                : t("创建自定义模板", "Create Custom Template")
              }
            </DialogTitle>
            <DialogDescription>
              {t(
                "自定义模板可以快速应用到任意角色的权限配置",
                "Custom templates can be quickly applied to any role's permission configuration"
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("中文名称", "Chinese Name")} *</Label>
                <Input
                  value={templateForm.name_zh}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, name_zh: e.target.value }))}
                  placeholder={t("输入模板名称", "Enter template name")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("英文名称", "English Name")} *</Label>
                <Input
                  value={templateForm.name_en}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, name_en: e.target.value }))}
                  placeholder="Enter template name"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("中文描述", "Chinese Description")}</Label>
                <Input
                  value={templateForm.description_zh}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, description_zh: e.target.value }))}
                  placeholder={t("可选", "Optional")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("英文描述", "English Description")}</Label>
                <Input
                  value={templateForm.description_en}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, description_en: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>
            
            <div className="space-y-3 pt-2">
              <Label>{t("权限设置", "Permission Settings")}</Label>
              <div className="flex items-center gap-6 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={templateForm.can_view}
                    onCheckedChange={(v) => setTemplateForm(prev => ({ ...prev, can_view: v }))}
                  />
                  <Label>{t("可查看", "View")}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={templateForm.can_edit}
                    onCheckedChange={(v) => setTemplateForm(prev => ({ ...prev, can_edit: v }))}
                  />
                  <Label>{t("可编辑", "Edit")}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={templateForm.can_delete}
                    onCheckedChange={(v) => setTemplateForm(prev => ({ ...prev, can_delete: v }))}
                  />
                  <Label>{t("可删除", "Delete")}</Label>
                </div>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>
              {t("取消", "Cancel")}
            </Button>
            <Button onClick={handleSaveTemplate}>
              {editingTemplate ? t("更新", "Update") : t("创建", "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTemplateId} onOpenChange={() => setDeleteTemplateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认删除", "Confirm Delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "此操作不可撤销，确定要删除这个自定义模板吗？",
                "This action cannot be undone. Are you sure you want to delete this custom template?"
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTemplate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("删除", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
