/**
 * UTF-8 字节被当作 Latin-1 读成字符串后的乱码修复（Node：Buffer）。
 */

export function repairUtf8MisdecodedAsLatin1(s: string): string {
  if (s == null || s.length < 2) return s;
  if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(s)) return s;

  let current = s;
  for (let pass = 0; pass < 2; pass++) {
    try {
      const candidate = Buffer.from(current, "latin1").toString("utf8");
      if (!candidate || candidate === current || candidate.includes("\uFFFD")) {
        break;
      }
      const hasCjk = /[\u4e00-\u9fff\u3000-\u303f]/.test(candidate);
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
