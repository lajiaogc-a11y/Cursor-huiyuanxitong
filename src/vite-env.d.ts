/// <reference types="vite/client" />

/** 构建时间，由 vite define 注入，用于验证线上版本 */
declare const __BUILD_TIME__: string;
/** package.json version，由 vite define 注入 */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** 逗号分隔会员端 hostname，方案 D；未设置则用 src/routes/siteMode.ts 默认 */
  readonly VITE_MEMBER_HOSTS?: string;
  readonly VITE_STAFF_HOSTS?: string;
}
