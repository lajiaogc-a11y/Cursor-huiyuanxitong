/**
 * 会员导入服务
 */

import { cleanPhoneNumber } from './utils';
import {
  listMembersApi,
  bulkCreateMembersApi,
  updateMemberByPhoneApi,
} from '@/services/members/membersApiService';

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
    const phoneSet = new Set(phoneNumbers);
    const allMembers = await listMembersApi({ limit: 10000 });
    allMembers
      .filter(m => phoneSet.has(m.phone_number))
      .forEach(m => existingMap.set(m.phone_number, { id: m.id, member_code: m.member_code }));
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
    const items = batch.map((r: Record<string, any>) => ({
      phone_number: r.phone_number,
      member_code: r.member_code,
      member_level: r.member_level,
      currency_preferences: r.currency_preferences,
      bank_card: r.bank_card,
      common_cards: r.common_cards,
      customer_feature: r.customer_feature,
      remark: r.remark,
      source_id: r.source_id ?? null,
      creator_id: r.creator_id ?? null,
    }));
    let created: { id: string }[] | null = null;
    try {
      created = await bulkCreateMembersApi(items);
    } catch {
      created = null;
    }
    if (created && created.length > 0) {
      result.imported += created.length;
    } else {
      for (const record of batch) {
        const single = await bulkCreateMembersApi([{
          phone_number: record.phone_number,
          member_code: record.member_code,
          member_level: record.member_level,
          currency_preferences: record.currency_preferences,
          bank_card: record.bank_card,
          common_cards: record.common_cards,
          customer_feature: record.customer_feature,
          remark: record.remark,
          source_id: record.source_id ?? null,
          creator_id: record.creator_id ?? null,
        }]);
        if (single && single.length > 0) {
          result.imported++;
        } else {
          result.errors.push(`电话 ${record.phone_number}: 创建失败`);
          result.skipped++;
        }
      }
    }
  }

  const UPDATE_PARALLEL_SIZE = 10;
  for (let i = 0; i < toUpdate.length; i += UPDATE_PARALLEL_SIZE) {
    const batch = toUpdate.slice(i, i + UPDATE_PARALLEL_SIZE);
    const updateResults = await Promise.all(
      batch.map(async ({ phone, data }) => {
        try {
          const body: Record<string, unknown> = {};
          if (data.member_level !== undefined) body.member_level = data.member_level;
          if (data.currency_preferences !== undefined) body.currency_preferences = data.currency_preferences;
          if (data.bank_card !== undefined) body.bank_card = data.bank_card;
          if (data.common_cards !== undefined) body.common_cards = data.common_cards;
          if (data.customer_feature !== undefined) body.customer_feature = data.customer_feature;
          if (data.remark !== undefined) body.remark = data.remark;
          if (data.source_id !== undefined) body.source_id = data.source_id;
          const updated = await updateMemberByPhoneApi(phone, body);
          return { phone, error: updated ? null : new Error('更新失败') };
        } catch (e) {
          return { phone, error: e as Error };
        }
      })
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
