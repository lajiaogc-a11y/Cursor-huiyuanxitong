// Order Store - 订单相关工具函数和类型定义
// 注意：订单数据存储在 Supabase 数据库中
// 使用 useOrders / useUsdtOrders hooks 进行数据操作
// 本模块仅提供类型定义和工具函数

import { logOperation } from './auditLogStore';
import {
  calculateOrderPointsSync,
  generateOrderNumber as utilGenerateOrderNumber,
} from '@/hooks/orders/utils';

// ============= 积分状态枚举 =============
export type PointsStatus = 'none' | 'added' | 'reversed';

// ============= 订单类型定义（前端显示用）=============
export interface Order {
  id: string;
  createdAt: string;
  cardType: string;
  cardValue: number;
  cardRate: number;
  foreignRate: number;
  cardWorth: number;
  actualPaid: number;
  fee: number;
  paymentValue: number;
  paymentProvider: string;
  vendor: string;
  profit: number;
  profitRate: number;
  phoneNumber: string;
  memberCode: string;
  demandCurrency: string;
  salesPerson: string;
  remark: string;
  status: "active" | "cancelled" | "completed";
  order_points?: number;
  points_status?: PointsStatus;
}

export interface UsdtOrder {
  id: string;
  createdAt: string;
  cardType: string;
  cardValue: number;
  cardRate: number;
  cardWorth: number;
  usdtRate: number;
  totalValueUsdt: number;
  actualPaidUsdt: number;
  feeUsdt: number;
  paymentValue: number;
  profit: number;
  profitRate: number;
  vendor: string;
  paymentProvider: string;
  phoneNumber: string;
  memberCode: string;
  demandCurrency: string;
  salesPerson: string;
  remark: string;
  status: "active" | "cancelled" | "completed";
  order_points?: number;
  points_status?: PointsStatus;
}

// ============= 积分计算（与 hooks/orders/utils 同源）=============
export const calculateOrderPoints = calculateOrderPointsSync;

// ============= 日志记录函数 =============
export function logOrderOperation(
  operationType: 'create' | 'update' | 'cancel' | 'restore' | 'delete' | 'status_change',
  orderId: string,
  beforeData: any,
  afterData: any,
  description: string
): void {
  logOperation(
    'order_management',
    operationType,
    orderId,
    beforeData,
    afterData,
    description
  );
}

// ============= 订单ID生成函数 =============
// 重要说明：这些函数仅用于生成订单显示编号（order_number），
// 不用于数据库主键（id）或积分明细的order_id
// 积分明细的order_id必须使用orders表的数据库UUID

/** 生成订单显示编号（YYMMDD + 3字母 + 5数字，与 hooks/orders/utils 一致） */
export function generateOrderNumber(): string {
  return utilGenerateOrderNumber();
}

/** @deprecated 使用 generateOrderNumber 替代 */
export function generateOrderId(): string {
  console.warn('[orderStore] generateOrderId is deprecated. Use generateOrderNumber instead. Note: This generates order_number, NOT database UUID.');
  return utilGenerateOrderNumber();
}

/** @deprecated 使用 generateOrderNumber 替代 */
export function generateUsdtOrderId(): string {
  console.warn('[orderStore] generateUsdtOrderId is deprecated. Use generateOrderNumber instead. Note: This generates order_number, NOT database UUID.');
  return utilGenerateOrderNumber();
}

// ============= 已弃用：以下函数仅用于兼容性，不再使用 localStorage =============
// 请使用 useOrders / useUsdtOrders hooks 进行数据操作

/** @deprecated 使用 useOrders hook */
export function getOrders(): Order[] {
  console.warn('[orderStore] getOrders is deprecated. Use useOrders hook instead.');
  return [];
}

/** @deprecated 使用 useOrders hook */
export function saveOrders(_orders: Order[]): void {
  console.warn('[orderStore] saveOrders is deprecated. Use useOrders hook instead.');
}

/** @deprecated 使用 useUsdtOrders hook */
export function getUsdtOrders(): UsdtOrder[] {
  console.warn('[orderStore] getUsdtOrders is deprecated. Use useUsdtOrders hook instead.');
  return [];
}

/** @deprecated 使用 useUsdtOrders hook */
export function saveUsdtOrders(_orders: UsdtOrder[]): void {
  console.warn('[orderStore] saveUsdtOrders is deprecated. Use useUsdtOrders hook instead.');
}

/** @deprecated 数据库不保留已删除订单 */
export function getDeletedOrders(): (Order & { deletedAt: string })[] {
  console.warn('[orderStore] getDeletedOrders is deprecated.');
  return [];
}

/** @deprecated 数据库不保留已删除订单 */
export function getDeletedUsdtOrders(): (UsdtOrder & { deletedAt: string })[] {
  console.warn('[orderStore] getDeletedUsdtOrders is deprecated.');
  return [];
}
