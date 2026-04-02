/**
 * 操作日志 before_data / after_data 规范化
 * MySQL 中 JSON 列或 TEXT 存 JSON 时，经 API 可能仍为字符串；若未解析就对字符串做 Object.keys，
 * 会得到 "0","1"… 字符下标，界面像「数据乱码/异常」。
 */

import { repairDeepStringValues, repairUtf8MisdecodedAsLatin1 } from "@/lib/utf8MojibakeRepair";

export const INVALID_OPERATION_LOG_JSON = "__invalidOperationLogJson";
export const OPERATION_LOG_RAW_PREVIEW = "__preview";

/** 将单条快照转为可对比的平面对象；解析失败时返回带标记的对象（由上层提示用户） */
export function parseOperationLogDataField(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;

  if (Array.isArray(raw)) {
    return repairDeepStringValues({ snapshot_array: raw }) as Record<string, unknown>;
  }
  if (typeof raw === "object" && raw !== null) {
    return repairDeepStringValues(raw) as Record<string, unknown>;
  }

  let parsed: unknown = raw;

  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    let v: unknown = t;
    for (let depth = 0; depth < 3; depth++) {
      if (typeof v !== "string") break;
      const s = v.trim();
      if (!s) return null;
      try {
        v = JSON.parse(s);
      } catch {
        return {
          [INVALID_OPERATION_LOG_JSON]: true,
          [OPERATION_LOG_RAW_PREVIEW]: s.length > 400 ? `${s.slice(0, 400)}…` : s,
        };
      }
    }
    parsed = v;
  }

  if (parsed === null) return null;
  if (Array.isArray(parsed)) {
    return repairDeepStringValues({ snapshot_array: parsed }) as Record<string, unknown>;
  }
  if (typeof parsed === "object") {
    return repairDeepStringValues(parsed) as Record<string, unknown>;
  }
  return repairDeepStringValues({ snapshot_value: parsed }) as Record<string, unknown>;
}

/** 生成面向用户的中/英文说明（数据无法解析、历史快照形态等） */
export function summarizeOperationLogPayloadIssues(
  lang: "zh" | "en",
  beforeRaw: unknown,
  afterRaw: unknown,
): string[] {
  const msgs: string[] = [];

  const checkSide = (side: "before" | "after", raw: unknown) => {
    if (raw == null || raw === "") return;
    const rec = parseOperationLogDataField(raw);
    if (rec && rec[INVALID_OPERATION_LOG_JSON] === true) {
      const prev = String(rec[OPERATION_LOG_RAW_PREVIEW] ?? "");
      const short = prev.length > 160 ? `${prev.slice(0, 160)}…` : prev;
      if (lang === "zh") {
        msgs.push(
          `「${side === "before" ? "修改前" : "修改后"}」快照不是合法 JSON，无法展开字段对比。常见原因：历史迁移数据损坏、手工改库、或编码截断。片段：${short}`,
        );
      } else {
        msgs.push(
          `The "${side === "before" ? "before" : "after"}" snapshot is not valid JSON, so field-level diff is unavailable. Common causes: legacy migration, manual DB edits, or truncation. Preview: ${short}`,
        );
      }
    }
  };

  checkSide("before", beforeRaw);
  checkSide("after", afterRaw);

  // 未解析的 JSON 字符串曾被当成字符串做逐字符 diff：全是数字 key
  const onlyNumericKeys = (o: Record<string, unknown> | null): boolean => {
    if (!o || o[INVALID_OPERATION_LOG_JSON]) return false;
    const keys = Object.keys(o).filter(
      (k) => !k.startsWith("__") && k !== "snapshot_array" && k !== "snapshot_value",
    );
    if (keys.length < 8) return false;
    return keys.every((k) => /^\d+$/.test(k));
  };

  const b = parseOperationLogDataField(beforeRaw);
  const a = parseOperationLogDataField(afterRaw);
  if (onlyNumericKeys(b) || onlyNumericKeys(a)) {
    if (lang === "zh") {
      msgs.push(
        "本条为旧版展示 bug 产生的快照（把 JSON 字符串按「单个字符」对比）。已尽量纠正显示；若仍异常，请以操作描述为准或联系管理员。",
      );
    } else {
      msgs.push(
        "This entry was affected by a legacy display bug (JSON string diffed character-by-character). Display is corrected when possible; rely on the description if unsure.",
      );
    }
  }

  return msgs;
}
