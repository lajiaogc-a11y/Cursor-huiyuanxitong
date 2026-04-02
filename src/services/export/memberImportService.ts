/**
 * 会员导入服务
 */

import { cleanPhoneNumber, normalizePhoneInputForImport } from './utils';
import {
  listMembersApi,
  bulkCreateMembersApi,
  updateMemberByPhoneApi,
} from '@/services/members/membersApiService';
import { broadcastMembersListStale, notifyDataMutation } from '@/services/system/dataRefreshManager';

import { generateMemberCode } from '@/lib/memberCode';
import type { BulkCreateMemberItem } from '@/api/members';

/**
 * 批量预处理会员记录
 */
export async function prepareMemberRecordsForBatch(
  records: Record<string, any>[],
  mode: 'insert' | 'upsert',
  currentUserId: string | null,
  tenantId: string | null
): Promise<{
  toInsert: Record<string, any>[];
  toUpdate: { phone: string; data: Record<string, any> }[];
  skipped: { row: number; error: string }[];
}> {
  const toInsert: Record<string, any>[] = [];
  const toUpdate: { phone: string; data: Record<string, any> }[] = [];
  const skipped: { row: number; error: string }[] = [];

  const listParams: { limit: number; tenant_id?: string } = { limit: 10000 };
  if (tenantId && String(tenantId).trim() !== '') {
    listParams.tenant_id = String(tenantId).trim();
  }
  const allMembers = await listMembersApi(listParams);
  const codeToPhone = new Map<string, string>();
  for (const m of allMembers) {
    if (m?.member_code) codeToPhone.set(String(m.member_code).trim(), m.phone_number);
  }

  const phoneNumbers: string[] = [];
  const cleanedRecords: { index: number; record: Record<string, any>; phone: string }[] = [];
  const seenInFile = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    const record = { ...records[i] };
    let phoneNumber = record.phone_number;

    if (!phoneNumber) {
      skipped.push({ row: i + 2, error: '缺少电话号码' });
      continue;
    }

    const rawPhoneDisplay = String(phoneNumber).trim().slice(0, 80);
    phoneNumber = normalizePhoneInputForImport(phoneNumber);
    phoneNumber = cleanPhoneNumber(phoneNumber);
    record.phone_number = phoneNumber;

    if (!phoneNumber || phoneNumber.length < 5) {
      skipped.push({
        row: i + 2,
        error: `电话号码格式无效（原始: ${rawPhoneDisplay || '空'}）`,
      });
      continue;
    }

    if (phoneNumber.length > 30) {
      skipped.push({
        row: i + 2,
        error: `电话号码过长（超过30字符，原始: ${rawPhoneDisplay}）`,
      });
      continue;
    }

    if (seenInFile.has(phoneNumber)) {
      skipped.push({ row: i + 2, error: '本文件内重复手机号' });
      continue;
    }
    seenInFile.add(phoneNumber);

    delete record.source_name;
    delete record.recorder_name;

    let refPhone =
      record.referrer_phone != null && String(record.referrer_phone).trim() !== ''
        ? cleanPhoneNumber(normalizePhoneInputForImport(record.referrer_phone))
        : '';
    if ((!refPhone || refPhone.length < 5) && record.referrer_member_code != null && String(record.referrer_member_code).trim() !== '') {
      const p = codeToPhone.get(String(record.referrer_member_code).trim());
      if (p) refPhone = cleanPhoneNumber(normalizePhoneInputForImport(p));
    }
    delete record.referrer_member_code;
    if (refPhone && refPhone.length >= 5) {
      record.referrer_phone = refPhone;
    } else {
      delete record.referrer_phone;
    }

    if (record.nickname != null) {
      const n = String(record.nickname).trim();
      record.nickname = n === '' ? null : n;
    }

    phoneNumbers.push(phoneNumber);
    cleanedRecords.push({ index: i, record, phone: phoneNumber });
  }

  const existingMap = new Map<string, { id: string; member_code: string }>();
  const phoneSet = new Set(phoneNumbers);
  for (const m of allMembers) {
    if (phoneSet.has(m.phone_number)) {
      existingMap.set(m.phone_number, { id: m.id, member_code: m.member_code });
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

function buildBulkItem(r: Record<string, any>): BulkCreateMemberItem {
  const item: BulkCreateMemberItem = {
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
  };
  if (r.nickname != null && r.nickname !== '') {
    item.nickname = r.nickname;
  }
  return item;
}

async function syncReferrersAfterCreate(
  records: Record<string, any>[],
  tenantId: string | null,
  pushError: (msg: string) => void,
) {
  for (const record of records) {
    if (!record.referrer_phone || String(record.referrer_phone).trim() === '') continue;
    try {
      const updated = await updateMemberByPhoneApi(record.phone_number, { referrer_phone: record.referrer_phone }, tenantId);
      if (!updated) pushError(`电话 ${record.phone_number}: 推荐人同步失败`);
    } catch (e) {
      pushError(`电话 ${record.phone_number}: 推荐人 — ${(e as Error)?.message || '错误'}`);
    }
  }
}

/**
 * 批量导入会员记录
 */
export async function batchImportMembers(
  records: Record<string, any>[],
  mode: 'insert' | 'upsert',
  currentUserId: string | null,
  tenantId: string | null
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const result = { imported: 0, skipped: 0, errors: [] as string[] };

  const { toInsert, toUpdate, skipped } = await prepareMemberRecordsForBatch(records, mode, currentUserId, tenantId);

  for (const s of skipped) {
    result.errors.push(`行 ${s.row}: ${s.error}`);
    result.skipped++;
  }

  const INSERT_BATCH_SIZE = 50;
  for (let i = 0; i < toInsert.length; i += INSERT_BATCH_SIZE) {
    const batch = toInsert.slice(i, i + INSERT_BATCH_SIZE);
    const items = batch.map((r: Record<string, any>) => buildBulkItem(r));
    let created: { id: string; phone_number: string }[] | null = null;
    try {
      created = await bulkCreateMembersApi(items, tenantId);
    } catch {
      created = null;
    }
    if (created !== null) {
      result.imported += created.length;
      const missed = batch.length - created.length;
      if (missed > 0) {
        result.skipped += missed;
        result.errors.push(
          `第 ${i + 1}–${i + batch.length} 条批次：${missed} 条未导入（手机号已存在、本批重复或编号冲突）`
        );
      }
      const createdPhones = new Set(created.map((c) => c.phone_number));
      const createdRecords = batch.filter((r) => createdPhones.has(r.phone_number));
      await syncReferrersAfterCreate(createdRecords, tenantId, (msg) => result.errors.push(msg));
    } else {
      for (const record of batch) {
        const single = await bulkCreateMembersApi([buildBulkItem(record)], tenantId);
        if (single && single.length > 0) {
          result.imported++;
          await syncReferrersAfterCreate([record], tenantId, (msg) => result.errors.push(msg));
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
          if (data.nickname !== undefined) body.nickname = data.nickname;
          if (data.referrer_phone !== undefined) body.referrer_phone = data.referrer_phone;
          const updated = await updateMemberByPhoneApi(phone, body, tenantId);
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

  if (result.imported > 0) {
    void notifyDataMutation({ table: 'members', operation: '*', source: 'mutation' });
    broadcastMembersListStale();
  }

  return result;
}
