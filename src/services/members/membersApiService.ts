/**
 * Members API Service - 通过 @/api/members 操作会员数据
 */
import * as membersApi from '@/api/members';

export type ApiMember = membersApi.ApiMember;
export type ApiReferralRelation = membersApi.ApiReferralRelation;
export type CustomerDetailResponse = membersApi.CustomerDetailResponse;
export type ListMembersParams = membersApi.ListMembersParams;
export type CreateMemberBody = membersApi.CreateMemberBody;
export type UpdateMemberBody = membersApi.UpdateMemberBody;
export type BulkCreateMemberItem = membersApi.BulkCreateMemberItem;

export const listMembersApi = membersApi.listMembers;
export const getMemberByIdApi = membersApi.getMemberById;
export const createMemberApi = membersApi.createMember;
export const updateMemberApi = membersApi.updateMember;
export const updateMemberByPhoneApi = membersApi.updateMemberByPhone;
export const deleteMemberApi = membersApi.deleteMember;
export const listReferralsApi = membersApi.listReferrals;
export const getCustomerDetailByPhoneApi = membersApi.getCustomerDetailByPhone;
export const bulkCreateMembersApi = membersApi.bulkCreateMembers;
