/**
 * WhatsApp 工作台 — 输入验证
 *
 * Step 10: 新增 searchMembersSchema, unbindMemberSchema
 */
import { z } from 'zod';

export const normalizePhoneSchema = z.object({
  phone: z.string().min(1, 'phone is required').max(32),
  countryCode: z.string().max(5).optional(),
});

export const memberByPhoneSchema = z.object({
  phone: z.string().min(1).max(32),
});

export const conversationContextSchema = z.object({
  phone: z.string().min(1).max(32),
  accountId: z.string().max(64).optional(),
});

export const conversationStatusQuerySchema = z.object({
  accountId: z.string().min(1).max(64),
  phone: z.string().min(1).max(32),
});

const VALID_STATUSES = ['unread', 'read_no_reply', 'replied', 'follow_up_required', 'priority', 'closed'] as const;

export const updateConversationStatusSchema = z.object({
  accountId: z.string().min(1).max(64),
  phone: z.string().min(1).max(32),
  status: z.enum(VALID_STATUSES),
  priorityLevel: z.number().int().min(0).max(2).optional(),
  note: z.string().max(500).optional(),
  assignedTo: z.string().max(36).nullable().optional(),
});

export const bindMemberPhoneSchema = z.object({
  accountId: z.string().min(1).max(64),
  phone: z.string().min(1).max(32),
  memberId: z.string().min(1).max(36),
  note: z.string().max(200).optional(),
});

export const unbindMemberPhoneSchema = z.object({
  phone: z.string().min(1).max(32),
});

export const searchMembersSchema = z.object({
  keyword: z.string().min(2).max(50),
});

export const addNoteSchema = z.object({
  accountId: z.string().min(1).max(64),
  phone: z.string().min(1).max(32),
  note: z.string().min(1).max(2000),
});
