// ============= 交班对账数据存储 =============
// 管理交班记录和接班人列表

import { apiPost, apiPatch, apiDelete } from '@/api/client';
import { logOperation } from '@/services/audit/auditLogService';
import { getCurrentOperatorSync } from '@/services/members/operatorService';

function unwrapSingle<T>(data: unknown): T | null {
  if (data == null) return null;
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  return data as T;
}
import { getShiftReceiversApi, getShiftHandoversApi } from '@/services/staff/dataApi';

export interface ShiftReceiver {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CardMerchantHandoverData {
  vendorName: string;
  balance: number;
  inputValue: number;
}

export interface PaymentProviderHandoverData {
  providerName: string;
  balance: number;
  inputValue: number;
}

export interface ShiftHandover {
  id: string;
  handover_employee_id: string | null;
  handover_employee_name: string;
  receiver_name: string;
  handover_time: string;
  card_merchant_data: CardMerchantHandoverData[];
  payment_provider_data: PaymentProviderHandoverData[];
  remark: string | null;
  created_at: string;
}

// ============= 接班人管理 =============

// 获取所有接班人列表
export async function getShiftReceivers(): Promise<ShiftReceiver[]> {
  try {
    const data = await getShiftReceiversApi();
    return data || [];
  } catch (error) {
    console.error('Failed to fetch shift receivers:', error);
    return [];
  }
}

// 添加新接班人（需要传入当前员工ID以实现用户隔离）
export async function addShiftReceiver(name: string, creatorId?: string): Promise<ShiftReceiver | null> {
  const trimmedName = name.trim();
  if (!trimmedName) return null;
  
  // 如果没有传入 creatorId，尝试从当前会话获取
  let employeeId = creatorId;
  if (!employeeId) {
    const op = getCurrentOperatorSync();
    if (op?.id) employeeId = op.id;
  }
  
  const inserted = await apiPost<unknown>(`/api/data/table/shift_receivers`, {
    data: {
      name: trimmedName,
      creator_id: employeeId,
    },
  });
  const data = unwrapSingle<ShiftReceiver>(inserted);
  if (!data) {
    console.error('Failed to add shift receiver');
    return null;
  }

  logOperation('system_settings', 'create', data.id, null, { name: data.name }, `新增接班人: ${data.name}`);

  return data;
}

// 更新接班人名称
export async function updateShiftReceiver(id: string, name: string, oldName?: string): Promise<ShiftReceiver | null> {
  const trimmedName = name.trim();
  if (!trimmedName) return null;
  
  const patched = await apiPatch<unknown>(
    `/api/data/table/shift_receivers?id=eq.${encodeURIComponent(id)}`,
    { data: { name: trimmedName, updated_at: new Date().toISOString() } }
  );
  const data = unwrapSingle<ShiftReceiver>(patched);
  if (!data) {
    console.error('Failed to update shift receiver');
    return null;
  }

  logOperation('system_settings', 'update', id, { name: oldName || id }, { name: data.name }, `修改接班人: ${oldName || id} → ${data.name}`);

  return data;
}

// 删除接班人
export async function deleteShiftReceiver(id: string, name?: string): Promise<boolean> {
  try {
    await apiDelete(`/api/data/table/shift_receivers?id=eq.${encodeURIComponent(id)}`);
  } catch (error) {
    console.error('Failed to delete shift receiver:', error);
    return false;
  }
  
  // 记录操作日志
  logOperation('system_settings', 'delete', id, { name: name || id }, null, `删除接班人: ${name || id}`);
  
  return true;
}

// ============= 交班记录管理 =============

// 获取所有交班记录
export async function getShiftHandovers(): Promise<ShiftHandover[]> {
  try {
    const data = await getShiftHandoversApi();
    return (data || []).map(item => ({
      ...item,
      card_merchant_data: (item.card_merchant_data as unknown as CardMerchantHandoverData[]) || [],
      payment_provider_data: (item.payment_provider_data as unknown as PaymentProviderHandoverData[]) || [],
    }));
  } catch (error) {
    console.error('Failed to fetch shift handovers:', error);
    return [];
  }
}

// 创建交班记录
export async function createShiftHandover(
  handoverEmployeeId: string | null,
  handoverEmployeeName: string,
  receiverName: string,
  cardMerchantData: CardMerchantHandoverData[],
  paymentProviderData: PaymentProviderHandoverData[],
  remark?: string
): Promise<ShiftHandover | null> {
  const inserted = await apiPost<unknown>(`/api/data/table/shift_handovers`, {
    data: {
      handover_employee_id: handoverEmployeeId,
      handover_employee_name: handoverEmployeeName,
      receiver_name: receiverName,
      card_merchant_data: cardMerchantData,
      payment_provider_data: paymentProviderData,
      remark: remark || null,
    },
  });
  const data = unwrapSingle<Record<string, unknown>>(inserted);
  if (!data) {
    console.error('Failed to create shift handover');
    return null;
  }

  const result = {
    ...data,
    card_merchant_data: (data.card_merchant_data as unknown as CardMerchantHandoverData[]) || [],
    payment_provider_data: (data.payment_provider_data as unknown as PaymentProviderHandoverData[]) || [],
  };
  
  // 记录操作日志
  logOperation('system_settings', 'create', String(data.id), null, {
    handover_employee_name: handoverEmployeeName,
    receiver_name: receiverName,
    card_merchant_count: cardMerchantData.length,
    payment_provider_count: paymentProviderData.length,
  }, `新增交班记录: ${handoverEmployeeName} → ${receiverName}`);
  
  return result as ShiftHandover;
}
