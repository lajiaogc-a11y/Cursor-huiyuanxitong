import type { LucideIcon } from "lucide-react";
import { ShoppingCart, Users, BarChart3, Wallet } from "lucide-react";

/** 员工登录/注册页左侧与移动端底部共用能力点（文案 key 为 login.module*） */
export const STAFF_AUTH_MODULE_ITEMS: readonly { key: string; icon: LucideIcon; color: string }[] = [
  { key: "moduleOrders", icon: ShoppingCart, color: "text-blue-400 border-blue-400/50" },
  { key: "moduleMembers", icon: Users, color: "text-emerald-400 border-emerald-400/50" },
  { key: "moduleReports", icon: BarChart3, color: "text-violet-400 border-violet-400/50" },
  { key: "moduleSettlement", icon: Wallet, color: "text-amber-400 border-amber-400/50" },
];
