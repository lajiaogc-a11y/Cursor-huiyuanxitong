/**
 * 排行榜公示用昵称脱敏：保留首字符，其余为 *（与前端 `exportUtils.maskName` 行为一致）。
 */
export function maskRankingDisplayName(raw: string | null | undefined): string {
  const name = String(raw ?? '').trim();
  if (!name) return '';
  if (name.length <= 1) return name;
  return name[0] + '*'.repeat(name.length - 1);
}
