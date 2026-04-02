/**
 * 共享实体查询服务 — 卡片 / 供应商 / 支付渠道的只读列表查询。
 *
 * 这些查询被 7+ 个域（报表、导出、名称解析、审计、交班等）使用，
 * 不属于 giftcards 域的 CRUD 操作，因此提取到 shared/ 下。
 *
 * 底层仍调用 giftcardsApiService 的实现，保持 API 端点不变。
 */
export {
  listCardsApi,
  listVendorsApi,
  listPaymentProvidersApi,
  type ApiCard,
  type ApiVendor,
  type ApiPaymentProvider,
} from '@/services/giftcards/giftcardsApiService';
