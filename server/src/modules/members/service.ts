/**
 * Members Service - 会员业务逻辑
 */
import {
  listMembersRepository,
  getMemberByIdRepository,
  createMemberRepository,
  updateMemberRepository,
  updateMemberByPhoneRepository,
  deleteMemberRepository,
  listReferralsRepository,
  getCustomerDetailByPhoneRepository,
  bulkCreateMembersRepository,
} from './repository.js';
import type { ListMembersQuery, CreateMemberBody, UpdateMemberBody, BulkCreateMemberItem } from './types.js';

export async function listMembersService(tenantId: string | undefined, query: ListMembersQuery) {
  return listMembersRepository(tenantId, query);
}

export async function getMemberByIdService(id: string, tenantId: string | undefined) {
  return getMemberByIdRepository(id, tenantId);
}

export async function createMemberService(tenantId: string, body: CreateMemberBody) {
  return createMemberRepository(tenantId, body);
}

export async function updateMemberService(id: string, tenantId: string, body: UpdateMemberBody) {
  return updateMemberRepository(id, tenantId, body);
}

export async function updateMemberByPhoneService(phone: string, tenantId: string, body: UpdateMemberBody) {
  return updateMemberByPhoneRepository(phone, tenantId, body);
}

export async function deleteMemberService(id: string, tenantId: string) {
  return deleteMemberRepository(id, tenantId);
}

export async function listReferralsService(tenantId?: string) {
  return listReferralsRepository(tenantId);
}

export async function getCustomerDetailByPhoneService(phone: string, tenantId?: string) {
  return getCustomerDetailByPhoneRepository(phone, tenantId);
}

export async function bulkCreateMembersService(tenantId: string, items: BulkCreateMemberItem[]) {
  return bulkCreateMembersRepository(tenantId, items);
}
