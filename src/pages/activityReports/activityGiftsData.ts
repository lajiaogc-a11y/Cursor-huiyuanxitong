import { calculateTransactionFee } from "@/lib/feeCalculation";
import { safeNumber } from "@/lib/safeCalc";
import { formatBeijingTime } from "@/lib/beijingTime";
import { getActivityDataApi, patchActivityGiftApi } from "@/services/staff/dataApi";
import { getEmployeeNameById } from "@/services/members/nameResolver";

export interface ActivityRecord {
  id: string;
  giftNumber?: string;
  order: number;
  time: string;
  currency: string;
  amount: string;
  rate: number;
  phone: string;
  paymentAgent: string;
  giftType: string;
  fee: number;
  giftValue: number;
  remark: string;
  recorder: string;
  creatorId: string;
  createdAt: string;
}

export interface ActivityGiftEditForm {
  currency: string;
  amount: string;
  rate: string;
  phone: string;
  paymentAgent: string;
  giftType: string;
  remark: string;
  creatorId: string;
}

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export const calculateGiftValue = (currency: string, amount: string, rate: number, fee: number): number => {
  const amountNum = parseFloat(amount) || 0;
  if (!amountNum || !rate) return 0;

  if (currency === "NGN") {
    return Math.abs(amountNum) / rate + fee;
  }
  return Math.abs(amountNum) * rate + fee;
};

export function computeActivityGiftFieldChanges(
  form: ActivityGiftEditForm,
  record: ActivityRecord,
): { fieldKey: string; oldValue: unknown; newValue: unknown }[] {
  const changes: { fieldKey: string; oldValue: unknown; newValue: unknown }[] = [];
  const rate = parseFloat(form.rate) || 0;
  if (form.currency !== record.currency) {
    changes.push({ fieldKey: "currency", oldValue: record.currency, newValue: form.currency });
  }
  if (form.amount !== record.amount) {
    changes.push({ fieldKey: "amount", oldValue: record.amount, newValue: form.amount });
  }
  if (rate !== record.rate) {
    changes.push({ fieldKey: "rate", oldValue: record.rate, newValue: rate });
  }
  if (form.phone !== record.phone) {
    changes.push({ fieldKey: "phone_number", oldValue: record.phone, newValue: form.phone });
  }
  if (form.paymentAgent !== record.paymentAgent) {
    changes.push({ fieldKey: "payment_agent", oldValue: record.paymentAgent, newValue: form.paymentAgent });
  }
  if (form.giftType !== record.giftType) {
    changes.push({ fieldKey: "gift_type", oldValue: record.giftType, newValue: form.giftType });
  }
  if (form.remark !== record.remark) {
    changes.push({ fieldKey: "remark", oldValue: record.remark, newValue: form.remark });
  }
  return changes;
}

export const loadActivityRecordsFromDB = async (tenantId?: string | null): Promise<ActivityRecord[]> => {
  try {
    const activityData = await getActivityDataApi(tenantId);

    return (activityData.gifts || []).map((gift: any, index: number) => {
      const rate = safeNumber(gift.rate);
      const fee = gift.fee !== undefined ? safeNumber(gift.fee) : calculateTransactionFee(gift.currency, String(gift.amount ?? "0"));
      const giftValue =
        gift.gift_value !== undefined
          ? safeNumber(gift.gift_value)
          : calculateGiftValue(gift.currency, String(gift.amount ?? "0"), rate, fee);

      const recorder = gift.creator_id ? getEmployeeNameById(gift.creator_id) : "";

      return {
        id: gift.id,
        giftNumber: gift.gift_number || "",
        order: index + 1,
        time: formatBeijingTime(gift.created_at),
        currency: gift.currency,
        amount: String(gift.amount),
        rate,
        phone: gift.phone_number,
        paymentAgent: gift.payment_agent || "",
        giftType: gift.gift_type || "",
        fee: safeNumber(fee),
        giftValue: safeNumber(giftValue),
        remark: gift.remark || "",
        recorder,
        creatorId: gift.creator_id || "",
        createdAt: gift.created_at,
      };
    });
  } catch (error) {
    console.error("Failed to load activity gifts from DB:", error);
    return [];
  }
};

export const updateActivityRecordInDB = async (
  id: string,
  record: Partial<ActivityRecord>,
  creatorId?: string,
): Promise<boolean> => {
  try {
    const updateData: Record<string, unknown> = {
      currency: record.currency,
      amount: parseFloat(record.amount || "0"),
      rate: record.rate,
      phone_number: record.phone,
      payment_agent: record.paymentAgent,
      gift_type: record.giftType,
      fee: record.fee,
      gift_value: record.giftValue,
      remark: record.remark,
    };
    if (creatorId !== undefined) {
      updateData.creator_id = creatorId || null;
    }
    const updated = await patchActivityGiftApi(id, updateData);
    if (!updated) throw new Error("update failed");
    return true;
  } catch (error) {
    console.error("Failed to update activity gift:", error);
    return false;
  }
};
