/**
 * 会员首页轮播 — 内置背景模板（SVG data URL，1200×675 / 16:9）
 *
 * 后台仅存 `image_preset_id`（短字符串），会员端按 id 还原 SVG，避免超长 data URL
 * 在保存/同步时被截断导致「模板不生效」。
 */

export const HOME_BANNER_TEMPLATE_SIZE = { w: 1200, h: 675 } as const;

export type HomeBannerTone = "light" | "dark";

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export interface HomeBannerPreset {
  id: string;
  nameZh: string;
  nameEn: string;
  tone: HomeBannerTone;
  /** data:image/svg+xml,... */
  dataUrl: string;
}

const W = 1200;
const H = 675;

/** 5 浅色 + 5 深色：克制渐变、微光与细线，偏高端会所 / 私行质感 */
function buildSvgs(): { id: string; nameZh: string; nameEn: string; tone: HomeBannerTone; svg: string }[] {
  return [
    {
      id: "cashmere-ivory",
      nameZh: "羊绒象牙",
      nameEn: "Cashmere Ivory",
      tone: "light",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="ci" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FDFCF9"/><stop offset="0.45" stop-color="#F5F0E8"/><stop offset="1" stop-color="#EDE6DC"/></linearGradient><linearGradient id="ci2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C9A962" stop-opacity="0"/><stop offset="0.55" stop-color="#C9A962" stop-opacity="0.09"/><stop offset="1" stop-color="#C9A962" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#ci)"/><rect width="100%" height="100%" fill="url(#ci2)"/><line x1="64" y1="${H - 48}" x2="${W - 64}" y2="${H - 48}" stroke="#C9A962" stroke-opacity="0.22" stroke-width="1"/></svg>`,
    },
    {
      id: "pearl-mist",
      nameZh: "珍珠雾灰",
      nameEn: "Pearl Mist",
      tone: "light",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="pm" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#EEF1F5"/><stop offset="0.5" stop-color="#F6F7F9"/><stop offset="1" stop-color="#E8EDF2"/></linearGradient><radialGradient id="pm2" cx="78%" cy="18%" r="0.55"><stop offset="0" stop-color="#94A3B8" stop-opacity="0.14"/><stop offset="1" stop-color="#94A3B8" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#pm)"/><rect width="100%" height="100%" fill="url(#pm2)"/></svg>`,
    },
    {
      id: "dawn-azure",
      nameZh: "晨雾蔚蓝",
      nameEn: "Dawn Azure",
      tone: "light",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="da" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F0F7FC"/><stop offset="0.5" stop-color="#E2EEF8"/><stop offset="1" stop-color="#DCE8F3"/></linearGradient><linearGradient id="da2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#0EA5E9" stop-opacity="0"/><stop offset="1" stop-color="#0EA5E9" stop-opacity="0.07"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#da)"/><rect width="100%" height="100%" fill="url(#da2)"/></svg>`,
    },
    {
      id: "oat-latte",
      nameZh: "燕麦拿铁",
      nameEn: "Oat Latte",
      tone: "light",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="ol" x1="0" y1="0" x2="1" y2="0.8"><stop offset="0" stop-color="#FAF6F1"/><stop offset="0.55" stop-color="#F3EBE3"/><stop offset="1" stop-color="#E8DDD2"/></linearGradient><radialGradient id="ol2" cx="12%" cy="88%" r="0.7"><stop offset="0" stop-color="#78716C" stop-opacity="0.08"/><stop offset="1" stop-color="#78716C" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#ol)"/><rect width="100%" height="100%" fill="url(#ol2)"/></svg>`,
    },
    {
      id: "mica-lilac",
      nameZh: "云母丁香",
      nameEn: "Mica Lilac",
      tone: "light",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="ml" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FAFAFC"/><stop offset="0.45" stop-color="#F4F2F8"/><stop offset="1" stop-color="#EDEAF4"/></linearGradient><radialGradient id="ml2" cx="50%" cy="0%" r="0.85"><stop offset="0" stop-color="#A78BFA" stop-opacity="0.12"/><stop offset="1" stop-color="#A78BFA" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#ml)"/><rect width="100%" height="100%" fill="url(#ml2)"/></svg>`,
    },
    {
      id: "midnight-gilt",
      nameZh: "午夜鎏金",
      nameEn: "Midnight Gilt",
      tone: "dark",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0c0a09"/><stop offset="0.55" stop-color="#1c1917"/><stop offset="1" stop-color="#292524"/></linearGradient><linearGradient id="mg2" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#d4a853" stop-opacity="0"/><stop offset="1" stop-color="#d4a853" stop-opacity="0.2"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#mg)"/><rect width="100%" height="100%" fill="url(#mg2)"/><rect x="0" y="598" width="${W}" height="77" fill="#d4a853" fill-opacity="0.06"/></svg>`,
    },
    {
      id: "deep-navy",
      nameZh: "深海蓝渊",
      nameEn: "Deep Navy",
      tone: "dark",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="dn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#020617"/><stop offset="0.5" stop-color="#0f172a"/><stop offset="1" stop-color="#1e3a5f"/></linearGradient><radialGradient id="dn2" cx="85%" cy="15%" r="0.55"><stop offset="0" stop-color="#38bdf8" stop-opacity="0.14"/><stop offset="1" stop-color="#38bdf8" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#dn)"/><rect width="100%" height="100%" fill="url(#dn2)"/></svg>`,
    },
    {
      id: "obsidian-noir",
      nameZh: "曜黑极简",
      nameEn: "Obsidian Noir",
      tone: "dark",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="on" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#18181b"/><stop offset="0.5" stop-color="#09090b"/><stop offset="1" stop-color="#27272a"/></linearGradient><radialGradient id="on2" cx="50%" cy="38%" r="0.72"><stop offset="0" stop-color="#fafafa" stop-opacity="0.045"/><stop offset="1" stop-color="#fafafa" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#on)"/><rect width="100%" height="100%" fill="url(#on2)"/></svg>`,
    },
    {
      id: "imperial-royal",
      nameZh: "帝国皇家",
      nameEn: "Imperial Royal",
      tone: "dark",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="ir" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#172554"/><stop offset="0.42" stop-color="#1e3a8a"/><stop offset="1" stop-color="#0f172a"/></linearGradient><linearGradient id="ir2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#eab308" stop-opacity="0"/><stop offset="0.5" stop-color="#eab308" stop-opacity="0.1"/><stop offset="1" stop-color="#eab308" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#ir)"/><rect width="100%" height="100%" fill="url(#ir2)"/></svg>`,
    },
    {
      id: "slate-ember",
      nameZh: "岩板余烬",
      nameEn: "Slate Ember",
      tone: "dark",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="se" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#0f1419"/><stop offset="0.5" stop-color="#1a222d"/><stop offset="1" stop-color="#0c1014"/></linearGradient><linearGradient id="se2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ea580c" stop-opacity="0"/><stop offset="0.5" stop-color="#ea580c" stop-opacity="0.12"/><stop offset="1" stop-color="#ea580c" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#se)"/><rect width="100%" height="100%" fill="url(#se2)"/></svg>`,
    },
  ];
}

export const HOME_BANNER_PRESETS: HomeBannerPreset[] = buildSvgs().map(({ svg, ...meta }) => ({
  ...meta,
  dataUrl: svgDataUrl(svg),
}));

export const HOME_BANNER_PRESETS_LIGHT = HOME_BANNER_PRESETS.filter((p) => p.tone === "light");
export const HOME_BANNER_PRESETS_DARK = HOME_BANNER_PRESETS.filter((p) => p.tone === "dark");

export function getHomeBannerPresetById(id: string | null | undefined): HomeBannerPreset | undefined {
  const k = String(id || "").trim();
  if (!k) return undefined;
  return HOME_BANNER_PRESETS.find((p) => p.id === k);
}
