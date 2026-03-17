// ============= 交班对账数据存储 =============
// 管理交班记录和接班人列表

import { supabase } from '@/integrations/supabase/client';
import { logOperation } from './auditLogStore';

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
    const { getShiftReceiversApi } = await import('@/api/data');
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
    const { getCurrentOperatorSync } = await import('@/services/members/operatorService');
    const op = getCurrentOperatorSync();
    if (op?.id) employeeId = op.id;
  }
  
  const { data, error } = await supabase
    .from('shift_receivers')
    .insert({ 
      name: trimmedName,
      creator_id: employeeId,
    })
    .select()
    .single();
  
  if (error) {
    console.error('Failed to add shift receiver:', error);
    return null;
  }
  
  // 记录操作日志
  logOperation('system_settings', 'create', data.id, null, { name: data.name }, `新增接班人: ${data.name}`);
  
  return data;
}

// 更新接班人名称
export async function updateShiftReceiver(id: string, name: string, oldName?: string): Promise<ShiftReceiver | null> {
  const trimmedName = name.trim();
  if (!trimmedName) return null;
  
  const { data, error } = await supabase
    .from('shift_receivers')
    .update({ name: trimmedName, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  
  if (error) {
    console.error('Failed to update shift receiver:', error);
    return null;
  }
  
  // 记录操作日志
  logOperation('system_settings', 'update', id, { name: oldName || id }, { name: data.name }, `修改接班人: ${oldName || id} → ${data.name}`);
  
  return data;
}

// 删除接班人
export async function deleteShiftReceiver(id: string, name?: string): Promise<boolean> {
  const { error } = await supabase
    .from('shift_receivers')
    .delete()
    .eq('id', id);
  
  if (error) {
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
    const { getShiftHandoversApi } = await import('@/api/data');
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
  const { data, error } = await supabase
    .from('shift_handovers')
    .insert([{
      handover_employee_id: handoverEmployeeId,
      handover_employee_name: handoverEmployeeName,
      receiver_name: receiverName,
      card_merchant_data: cardMerchantData as unknown as any,
      payment_provider_data: paymentProviderData as unknown as any,
      remark: remark || null,
    }])
    .select()
    .single();
  
  if (error) {
    console.error('Failed to create shift handover:', error);
    return null;
  }
  
  const result = {
    ...data,
    card_merchant_data: (data.card_merchant_data as unknown as CardMerchantHandoverData[]) || [],
    payment_provider_data: (data.payment_provider_data as unknown as PaymentProviderHandoverData[]) || [],
  };
  
  // 记录操作日志
  logOperation('system_settings', 'create', data.id, null, {
    handover_employee_name: handoverEmployeeName,
    receiver_name: receiverName,
    card_merchant_count: cardMerchantData.length,
    payment_provider_count: paymentProviderData.length,
  }, `新增交班记录: ${handoverEmployeeName} → ${receiverName}`);
  
  return result;
}
