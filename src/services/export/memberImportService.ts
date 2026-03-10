/**
 * 会员导入服务
 */

import { supabase } from '@/integrations/supabase/client';
import { cleanPhoneNumber } from './utils';

function generateMemberCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 7; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * 批量预处理会员记录
 */
export async function prepareMemberRecordsForBatch(
  records: Record<string, any>[],
  mode: 'insert' | 'upsert',
  currentUserId: string | null
): Promise<{
  toInsert: Record<string, any>[];
  toUpdate: { phone: string; data: Record<string, any> }[];
  skipped: { row: number; error: string }[];
}> {
  const toInsert: Record<string, any>[] = [];
  const toUpdate: { phone: string; data: Record<string, any> }[] = [];
  const skipped: { row: number; error: string }[] = [];

  const phoneNumbers: string[] = [];
  const cleanedRecords: { index: number; record: Record<string, any>; phone: string }[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = { ...records[i] };
    let phoneNumber = record.phone_number;

    if (!phoneNumber) {
      skipped.push({ row: i + 2, error: '缺少电话号码' });
      continue;
    }

    phoneNumber = cleanPhoneNumber(String(phoneNumber));
    record.phone_number = phoneNumber;

    if (!phoneNumber || phoneNumber.length < 5) {
      skipped.push({ row: i + 2, error: `电话号码格式无效: ${phoneNumber}` });
      continue;
    }

    delete record.source_name;
    delete record.referrer_phone;
    delete record.recorder_name;

    phoneNumbers.push(phoneNumber);
    cleanedRecords.push({ index: i, record, phone: phoneNumber });
  }

  const existingMap = new Map<string, { id: string; member_code: string }>();
  if (phoneNumbers.length > 0) {
    const BATCH_SIZE = 100;
    for (let i = 0; i < phoneNumbers.length; i += BATCH_SIZE) {
      const batch = phoneNumbers.slice(i, i + BATCH_SIZE);
      const { data } = await supabase
        .from('members')
        .select('id, member_code, phone_number')
        .in('phone_number', batch);

      if (data) {
        data.forEach(m => existingMap.set(m.phone_number, { id: m.id, member_code: m.member_code }));
      }
    }
  }

  for (const { index, record, phone } of cleanedRecords) {
    const existing = existingMap.get(phone);

    if (!record.member_code) {
      record.member_code = existing?.member_code || generateMemberCode();
    }

    if (!record.created_at) {
      record.created_at = new Date().toISOString();
    }

    if (!record.creator_id && currentUserId) {
      record.creator_id = currentUserId;
    }

    if (record.common_cards && typeof record.common_cards === 'string' && !record.common_cards.startsWith('[')) {
      record.common_cards = record.common_cards.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
    if (record.currency_preferences && typeof record.currency_preferences === 'string' && !record.currency_preferences.startsWith('[')) {
      record.currency_preferences = record.currency_preferences.split(',').map((s: string) => s.trim()).filter(Boolean);
    }

    if (existing && mode === 'upsert') {
      toUpdate.push({ phone, data: record });
    } else if (!existing) {
      toInsert.push(record);
    } else {
      skipped.push({ row: index + 2, error: '记录已存在' });
    }
  }

  return { toInsert, toUpdate, skipped };
}

/**
 * 批量导入会员记录
 */
export async function batchImportMembers(
  records: Record<string, any>[],
  mode: 'insert' | 'upsert',
  currentUserId: string | null
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const result = { imported: 0, skipped: 0, errors: [] as string[] };

  const { toInsert, toUpdate, skipped } = await prepareMemberRecordsForBatch(records, mode, currentUserId);

  for (const s of skipped) {
    result.errors.push(`行 ${s.row}: ${s.error}`);
    result.skipped++;
  }

  const INSERT_BATCH_SIZE = 50;
  for (let i = 0; i < toInsert.length; i += INSERT_BATCH_SIZE) {
    const batch = toInsert.slice(i, i + INSERT_BATCH_SIZE);
    const { error } = await supabase
      .from('members')
      .insert(batch as any)
      .select('id');

    if (error) {
      for (const record of batch) {
        const { error: singleError } = await supabase.from('members').insert(record as any);
        if (singleError) {
          result.errors.push(`电话 ${record.phone_number}: ${singleError.message}`);
          result.skipped++;
        } else {
          result.imported++;
        }
      }
    } else {
      result.imported += batch.length;
    }
  }

  const UPDATE_PARALLEL_SIZE = 10;
  for (let i = 0; i < toUpdate.length; i += UPDATE_PARALLEL_SIZE) {
    const batch = toUpdate.slice(i, i + UPDATE_PARALLEL_SIZE);
    const updateResults = await Promise.all(
      batch.map(({ phone, data }) =>
        supabase.from('members').update(data as any).eq('phone_number', phone)
          .then(({ error }) => ({ phone, error }))
      )
    );

    for (const { phone, error } of updateResults) {
      if (error) {
        result.errors.push(`更新 ${phone}: ${error.message}`);
        result.skipped++;
      } else {
        result.imported++;
      }
    }
  }

  return result;
}
