/**
 * @deprecated 已改名为 orderWriteGateway.ts — 此文件仅为向后兼容 re-export。
 * 新代码请直接 import '@/services/orders/orderWriteGateway'。
 */
export {
  insertOrderRecord,
  updateOrderRecord,
  patchOrderRecord,
  getOrderDeleteState,
  type OrderInsertPayload,
} from './orderWriteGateway';
