/**
 * 复制设置：与 shared_data_store.store_key = copySettings 对齐。
 * 单独文件避免 sharedDataService 与 CopySettingsTab 循环依赖。
 */
export interface CopySettings {
  enabled: boolean;
  customNote: string;
  customNoteEnglish: string;
}

export const DEFAULT_COPY_SETTINGS: CopySettings = {
  enabled: true,
  customNote: `说明：
1：您兑换的货币我们都会按照国家汇率换算成美元。
2：1美元等于1积分
3：总积分=推荐积分+获得积分
4：活动时间随时结束，具体请接受团队公告为准。
5：最终解释权归FastGC所有`,
  customNoteEnglish: `Important Notes / Key Information

1.All currency conversions are calculated based on the current exchange rate of each country or region against the US Dollar (USD).

2.1 USD = 1 Point.

3.Total Points = Referral Points + Earned Points.

4.After each redemption, all points will be reset to zero.

5.The promotion may end at any time. Please follow team announcements for the latest updates.

6.FastGC reserves the right of final interpretation.`,
};

/** 将数据库/缓存中的任意结构还原为当前 CopySettings（含旧版 template 等字段迁移） */
export function normalizeCopySettingsFromStorage(raw: unknown): CopySettings {
  const out: CopySettings = { ...DEFAULT_COPY_SETTINGS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return out;
  }
  const o = raw as Record<string, unknown>;

  if (typeof o.enabled === "boolean") {
    out.enabled = o.enabled;
  }

  const legacyTemplate = typeof o.template === "string" ? o.template : "";

  if ("customNote" in o && typeof o.customNote === "string") {
    out.customNote = o.customNote;
  } else if (legacyTemplate.trim()) {
    out.customNote = legacyTemplate;
  }

  if ("customNoteEnglish" in o && typeof o.customNoteEnglish === "string") {
    out.customNoteEnglish = o.customNoteEnglish;
  }

  return out;
}
