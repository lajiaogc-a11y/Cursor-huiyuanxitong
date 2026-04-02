/** Space-separated HSL for member CSS: `hsl(var(--pu-gold))` */

/** premium-ui-boost 默认主色 ≈ hsl(219 100% 65%)，无租户色时与稿一致 */
const DEFAULT_HEX = "#4d8cff";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = ((max + min) / 2) * 100;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = (l > 50 ? d / (2 - max - min) : d / (max + min)) * 100;

  let h = 0;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
  }

  return { h: h * 360, s, l };
}

function tripletCss(h: number, s: number, l: number): string {
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

export type MemberPortalGoldCssVars = {
  "--pu-gold": string;
  "--pu-gold-soft": string;
  "--pu-gold-deep": string;
  "--m-theme-dark": string;
};

/** Derive boost gold tokens + theme-dark from tenant primary hex (MemberLayout inline style). */
export function memberPortalGoldCssVarsFromHex(hex: string): MemberPortalGoldCssVars {
  const rgb = hexToRgb(hex) ?? hexToRgb(DEFAULT_HEX)!;
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);

  const softS = clamp(s + 6, 0, 100);
  const softL = clamp(l + 16, 0, 92);
  const deepS = clamp(s + 2, 0, 100);
  const deepL = clamp(l - 12, 18, 55);
  const hh = Math.round(h);

  return {
    "--pu-gold": tripletCss(h, s, l),
    "--pu-gold-soft": tripletCss(h, softS, softL),
    "--pu-gold-deep": tripletCss(h, deepS, deepL),
    "--m-theme-dark": `hsl(${hh} ${Math.round(deepS)}% ${Math.round(deepL)}%)`,
  };
}
