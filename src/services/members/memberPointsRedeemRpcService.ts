/**
 * 员工端：会员活动数据 — 积分兑换（事务 RPC）
 */
import { apiPost } from "@/api/client";

export type RedeemPointsAndRecordParams = {
  p_member_code: string;
  p_phone: string;
  p_member_id: string | null;
  p_points_to_redeem: number;
  p_activity_type: string;
  p_gift_currency: string;
  p_gift_amount: number;
  p_gift_rate: number;
  p_gift_fee: number;
  p_gift_value: number;
  p_payment_agent: string | null;
  p_creator_id: string | null;
  p_creator_name: string | null;
  /** 与 LanguageContext 一致：zh / en，用于服务端写入备注文案 */
  p_remark_locale?: "zh" | "en";
};

export type RedeemPointsAndRecordResult = {
  success: boolean;
  error?: string;
  points_redeemed?: number;
  /** 活动赠送记录 id（成功时由后端返回） */
  gift_id?: string;
  /** POINTS_MISMATCH 等错误时当前积分 */
  current?: number;
  ledger_id?: string;
  points_before?: number;
};

export async function redeemPointsAndRecordRpc(params: RedeemPointsAndRecordParams): Promise<RedeemPointsAndRecordResult> {
  return apiPost<RedeemPointsAndRecordResult>("/api/data/rpc/redeem_points_and_record", params);
}
