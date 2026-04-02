/** 会员等级（不含「普通会员」展示项） */
export const MEMBER_LEVELS = ['A', 'B', 'C', 'D'] as const;
export type MemberLevelCode = (typeof MEMBER_LEVELS)[number];

/** 下拉/选择器用（含普通会员文案） */
export const MEMBER_LEVEL_OPTIONS_WITH_DEFAULT = ['普通会员', 'A', 'B', 'C', 'D'] as const;

export function isStandardMemberLevel(level: string): boolean {
  return MEMBER_LEVELS.includes(level as MemberLevelCode);
}
