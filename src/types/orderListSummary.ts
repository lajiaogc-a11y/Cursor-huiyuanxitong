/**
 * 订单列表/API 返回的摘要行（与 MySQL orders 常用列、后端 list 接口一致）。
 * 服务端对应：server/src/types/orderListSummary.ts（请保持字段同步）。
 */
export interface OrderListSummary {
  id: string;
  order_number: string;
  order_type: string;
  amount: number;
  currency: string | null;
  status: string;
  created_at: string;
}
