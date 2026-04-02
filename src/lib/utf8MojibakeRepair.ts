/**
 * UTF-8 字节被当作 Latin-1/ISO-8859-1 解码后，在 UTF-8 环境下会显示为乱码（如 å·¥ä½œ）。
 * 将每个 code unit（≤255）视为原始字节再按 UTF-8 解码；最多两轮以处理重复错误解码。
 */
export function repairUtf8MisdecodedAsLatin1(s: string): string {
  if (s == null || s.length < 2) return s;
  if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(s)) return s;

  let current = s;
  for (let pass = 0; pass < 2; pass++) {
    try {
      const bytes = new Uint8Array(current.length);
      for (let i = 0; i < current.length; i++) {
        const c = current.charCodeAt(i);
        if (c > 255) return s;
        bytes[i] = c;
      }
      const candidate = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      if (!candidate || candidate === current || candidate.includes("\uFFFD")) {
        break;
      }
      const hasCjk = /[\u4e00-\u9fff\u3000-\u303f]/.test(candidate);
      // 原逻辑仅在有中文时修复，导致纯英文/拉丁字符的 UTF-8→Latin-1 乱码（如 Ã©、â€™）无法恢复
      const mojibakeSig =
        /Ã[\u00a1-\u00ff]|Â[\u00a0-\u00ff]|â€[™šœž˜]|â€™|â€œ|â€”|â€“|â€˜|â€¢/i;
      const looksLikeUtf8MisreadAsLatin1 =
        hasCjk || (mojibakeSig.test(current) && !mojibakeSig.test(candidate));
      if (looksLikeUtf8MisreadAsLatin1) {
        current = candidate;
        continue;
      }
    } catch {
      /* ignore */
    }
    break;
  }
  return current;
}

/** 仅修复对象/数组中的字符串叶子，避免改动字段名导致映射失效 */
export function repairDeepStringValues(input: unknown, depth = 0): unknown {
  if (depth > 30) return input;
  if (typeof input === "string") return repairUtf8MisdecodedAsLatin1(input);
  if (input === null || typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map((x) => repairDeepStringValues(x, depth + 1));
  const o = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o)) {
    out[k] = repairDeepStringValues(o[k], depth + 1);
  }
  return out;
}
