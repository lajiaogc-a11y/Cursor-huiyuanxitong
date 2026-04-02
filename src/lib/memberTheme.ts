/**
 * Member portal hex fallbacks (e.g. canvas, exports, rare non-CSS callers).
 * In-app surfaces should prefer `hsl(var(--pu-gold))` / `--pu-gold-soft` / `--pu-gold-deep`
 * from `html.member-html` or `.member-portal-wrap` (see `memberPortalGoldCssVarsFromHex`).
 */
export const MEMBER_THEME = {
  primary: "#4d8cff",
  primaryDark: "#2563eb",
  primaryLight: "#93c5fd",
} as const;
