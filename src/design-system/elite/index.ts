/**
 * Elite UI design system (staff: light SaaS; member: dark + gold).
 *
 * Integration rules for this repo:
 * - Do not change API routes or service clients.
 * - Keep React Router paths in `src/routes/*` unchanged.
 * - Migrate screens incrementally: import primitives from this barrel, replace local
 *   layout wrappers while preserving existing hooks (useMembers, useOrders, etc.).
 * - Staff / member shells: `MainLayout`（窄视口为顶栏+抽屉侧栏+全宽主区）/ `MemberLayout` apply
 *   `elite-staff-shell` / `elite-member-shell` (see `src/styles/elite-design-tokens.css`).
 * - Responsive detail drawer: `@/components/shell` → `DrawerDetail` (Sheet: right desktop / bottom mobile).
 * - Spec-named aliases: `@/components/common`, data primitives `@/components/data`.
 *
 * The standalone reference you generated (Vite 7 + separate routes) is not copied here
 * to avoid duplicating the app shell; use this layer as the single source of truth.
 */
export * from "./components";
export * from "./page-templates";
