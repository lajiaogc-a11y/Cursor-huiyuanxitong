import type { Language } from '@/contexts/LanguageContext';

/** 会员等级展示：中文界面优先中文名，否则退回英文；英文界面用英文。 */
export function displayMemberLevelLabel(
  levelEn: string | null | undefined,
  levelZh: string | null | undefined,
  language: Language,
): string {
  const en = String(levelEn || '').trim();
  const zh = String(levelZh || '').trim();
  if (language === 'zh' && zh) return zh;
  return en || zh;
}
