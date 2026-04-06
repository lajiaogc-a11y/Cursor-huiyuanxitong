/**
 * 员工端左侧导航单一数据源（不含图标，供 Sidebar 与数据清理中心等复用）。
 * 新增顶层导航时只改此处 + Sidebar 的图标映射。
 */

import { ROUTES } from "@/routes/constants";

export type StaffNavChildItem = {
  labelZh: string;
  labelEn: string;
  path: string;
  sectionLabel?: string;
  sectionLabelEn?: string;
};

export type StaffNavTopLevelBase = {
  navKey: string;
  labelZh: string;
  labelEn: string;
  path: string;
  badgeType?: "unread" | "pending";
  children?: StaffNavChildItem[];
};

/** 与 Sidebar 原 allMenuItems 顺序、文案、path、navKey 保持一致 */
export const STAFF_NAV_TOP_LEVEL_ITEMS: StaffNavTopLevelBase[] = [
  { navKey: "dashboard", labelZh: "数据统计", labelEn: "Dashboard", path: "/staff" },
  { navKey: "exchange_rate", labelZh: "汇率计算", labelEn: "Exchange Rate", path: "/staff/exchange-rate" },
  { navKey: "orders", labelZh: "订单管理", labelEn: "Orders", path: "/staff/orders" },
  {
    navKey: "members",
    labelZh: "会员管理",
    labelEn: "Users",
    path: "/staff/members",
    children: [
      { labelZh: "会员数据", labelEn: "User Data", path: "/staff/members?tab=members" },
      { labelZh: "活动数据", labelEn: "Activity Data", path: "/staff/members?tab=activity" },
      { labelZh: "活动赠送", labelEn: "Activity Gifts", path: "/staff/members?tab=gifts" },
      { labelZh: "积分明细", labelEn: "Points Ledger", path: "/staff/members?tab=points" },
    ],
  },
  { navKey: "merchant_settlement", labelZh: "商家结算", labelEn: "Settlement", path: "/staff/merchant-settlement" },
  { navKey: "knowledge_base", labelZh: "公司文档", labelEn: "Company Docs", path: "/staff/knowledge", badgeType: "unread" },
  { navKey: "reports", labelZh: "报表管理", labelEn: "Reports", path: "/staff/reports" },
  {
    navKey: "work_tasks",
    labelZh: "工作任务",
    labelEn: "Tasks",
    path: "/staff/tasks/settings",
    children: [
      { labelZh: "维护设置", labelEn: "Settings", path: "/staff/tasks/settings" },
      { labelZh: "维护历史", labelEn: "History", path: "/staff/tasks/history" },
      { labelZh: "动态任务", labelEn: "Post Tasks", path: "/staff/tasks/posters" },
      { labelZh: "提取设置", labelEn: "Extract Settings", path: "/staff/tasks/phone-extract" },
    ],
  },
  {
    navKey: "merchant_management",
    labelZh: "商家管理",
    labelEn: "Merchants",
    path: "/staff/merchants",
    children: [
      { labelZh: "卡片管理", labelEn: "Cards", path: "/staff/merchants?tab=cards" },
      { labelZh: "卡商管理", labelEn: "Vendors", path: "/staff/merchants?tab=vendors" },
      { labelZh: "代付商家", labelEn: "Payment Providers", path: "/staff/merchants?tab=payment-providers" },
    ],
  },
  { navKey: "audit_center", labelZh: "审核中心", labelEn: "Audit", path: "/staff/audit-center", badgeType: "pending" },
  { navKey: "employees", labelZh: "员工管理", labelEn: "Employees", path: "/staff/employees" },
  { navKey: "member_portal_settings", labelZh: "会员系统", labelEn: "Member Portal", path: "/staff/member-portal" },
  { navKey: "operation_logs", labelZh: "操作日志", labelEn: "Logs", path: "/staff/operation-logs" },
  { navKey: "login_logs", labelZh: "登录日志", labelEn: "Login Logs", path: "/staff/login-logs" },
  {
    navKey: "data_management",
    labelZh: "数据管理",
    labelEn: "Data Management",
    path: ROUTES.STAFF.DATA_MANAGEMENT,
  },
  {
    navKey: "system_settings",
    labelZh: "系统设置",
    labelEn: "Settings",
    path: "/staff/settings",
    children: [
      { labelZh: "手续费设置", labelEn: "Fee", path: "/staff/settings?tab=fee", sectionLabel: "业务配置", sectionLabelEn: "Business" },
      { labelZh: "汇率设置", labelEn: "Exchange", path: "/staff/settings?tab=exchange" },
      { labelZh: "币种设置", labelEn: "Currency", path: "/staff/settings?tab=currency" },
      { labelZh: "积分设置", labelEn: "Points", path: "/staff/settings?tab=points", sectionLabel: "会员配置", sectionLabelEn: "Membership" },
      { labelZh: "会员等级", labelEn: "User levels", path: "/staff/settings?tab=member-levels" },
      { labelZh: "活动设置", labelEn: "Activity", path: "/staff/settings?tab=activity" },
      { labelZh: "活动类型", labelEn: "Activity Type", path: "/staff/settings?tab=activityType" },
      { labelZh: "活动分配", labelEn: "Gift Distribution", path: "/staff/settings?tab=giftDistribution" },
      { labelZh: "客户来源", labelEn: "Customer Source", path: "/staff/settings?tab=source" },
      { labelZh: "复制设置", labelEn: "Copy", path: "/staff/settings?tab=copy" },
      { labelZh: "员工邀请码", labelEn: "Staff invite", path: "/staff/settings?tab=staff-invite" },
      { labelZh: "登录IP限制", labelEn: "Staff login IP", path: "/staff/settings?tab=staff-login-ip" },
      { labelZh: "后台登录设备", labelEn: "Staff login devices", path: "/staff/settings?tab=staff-devices" },
      { labelZh: "版本更新", labelEn: "Version update", path: "/staff/settings?tab=version-update" },
      { labelZh: "权限设置", labelEn: "Permissions", path: "/staff/settings?tab=permission" },
      { labelZh: "API管理", labelEn: "API", path: "/staff/settings?tab=api" },
      { labelZh: "设置总览", labelEn: "Overview", path: "/staff/settings?tab=overview" },
    ],
  },
  { navKey: "platform_tenant_management", labelZh: "租户管理", labelEn: "Tenants", path: "/staff/admin/tenants" },
  { navKey: "platform_tenant_view", labelZh: "租户数据查看", labelEn: "View Tenant Data", path: "/staff/admin/tenant-view" },
  { navKey: "platform_settings", labelZh: "平台设置", labelEn: "Platform Settings", path: "/staff/admin/settings" },
];

/** 独立「数据管理」页路径（与 ROUTES.STAFF.DATA_MANAGEMENT 一致） */
export const STAFF_DATA_MANAGEMENT_PATH = ROUTES.STAFF.DATA_MANAGEMENT;
