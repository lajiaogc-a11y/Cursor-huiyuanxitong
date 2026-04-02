/**
 * 订单列表摘要行 — 与前端 src/types/orderListSummary.ts 保持一致。
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
