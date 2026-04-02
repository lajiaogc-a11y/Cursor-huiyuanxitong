# 稳定性重构说明（首屏主题 / 移动端滚动）

## 架构说明（SPA 边界）

本项目为 **Vite + React SPA**：业务 UI 仍由 React 挂载在 `#root`。若需「导航/整页布局完全静态写在 HTML、不经 JS 渲染」，需改为 **SSR（Next/Remix）** 或 **MPA + 多入口 HTML**。本次在 **不改动 SPA 架构** 前提下，解决 **主题 FOUC** 与 **首屏背景色**，并优化移动端主滚动。

## 新增 / 修改文件

| 路径 | 作用 |
|------|------|
| `public/theme-init.js` | 阻塞脚本：首帧前读取 `localStorage`（`appTheme`），设置 `html.dark` 与 `meta theme-color` |
| `src/lib/appTheme.ts` | 主题读写与 `documentElement` / `theme-color` 的单一逻辑源（TS 侧） |
| `index.html` | 内联**关键 CSS**（深/浅背景与 `#root` 最小高度）；`theme-init.js` 放在 `theme-color` meta 之后 |
| `src/contexts/ThemeContext.tsx` | 初值 `useState(() => readInitialAppTheme())`，移除 mount 后再读存储并 `setState` 的 `useEffect` |
| `src/index.css` | 工具类 `.native-scroll-y`（粗指针设备上 `-webkit-overflow-scrolling: touch`） |
| `src/components/layout/MobileLayout.tsx` | 主内容 `main` 增加 `native-scroll-y` |

## 删除 / 收敛的冗余逻辑

- **已删**：`ThemeProvider` 内 `useEffect` 在挂载后从 `localStorage` / `prefers-color-scheme` 再设主题（导致首屏浅色 → 再变深色）。
- **行为变更**：未保存过主题时，**默认深色**（不再跟随系统浅色模式自动浅色）。若需恢复「跟随系统」，应在 `readInitialAppTheme` 与 `theme-init.js` 中同步改逻辑。

## 未删除的「补丁」类代码（建议保留）

- `main.tsx` 等对 **ChunkLoadError** 的处理：属于部署/缓存导致的白屏恢复，与「视觉稳定性」不同维度；删除会降低线上容错。

## 维护注意

- `public/theme-init.js` 中的键名、默认值、`theme-color` 十六进制须与 `src/lib/appTheme.ts` 注释保持一致（CSP 限制下无法用 TS 直接生成该文件）。
