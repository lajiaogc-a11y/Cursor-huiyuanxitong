# CSP、Console 与白屏排查

## Content-Security-Policy（`index.html`）

- **`connect-src`**：已包含 `https:`、`wss:` 以及本地 `http://127.0.0.1:*` / `http://localhost:*`，便于：
  - 生产环境任意 HTTPS API（`VITE_API_BASE` 指向的域名）
  - 开发环境直连后端或 Vite 代理
- 若仍出现 **`Refused to connect because it violates CSP`**：
  1. 打开 DevTools → **Console**，查看被拦截的完整 URL。
  2. 若为 **WebSocket**（非 HTTPS），需在 `connect-src` 中增加对应 `ws:` 源。
  3. 若为 **HTTP 内网 IP**（非 localhost），需增加形如 `http://192.168.x.x:*`（按实际收紧）。

## 白屏 / 运行时错误

1. **Chrome DevTools → Console**：看红色报错栈；**Network** 看 4xx/5xx 与失败请求域名。
2. **Safari 真机**：设置 → Safari → 高级 → **Web 检查器**，连接 Mac 后在 Safari「开发」菜单中调试。
3. 应用内已有 **ErrorBoundary**（路由内）；根级在 `main.tsx` 再包一层，避免 Provider 之前崩溃导致纯白屏。
4. 若错误信息含 **`Content Security Policy`**，优先按上文调整 `connect-src` / `img-src`。

## 图片与性能

- Banner / Logo 上传前在客户端做 **长边缩放 + WebP**（见 `src/lib/imageClientCompress.ts`）。
- 会员头像 WebP 逻辑可继续沿用 `MemberPortalSettings` 内 `imageFileToWebpDataUrl` 或统一改为调用上述工具函数。

## React Query 重复请求

- 全局默认：`src/lib/queryClient.ts`（`staleTime` 5 分钟、`refetchOnMount: false`）。
- 带 **轮询** 的 hook 使用 `src/lib/reactQueryPolicy.ts` 中的 `POLL_INTERVAL_RELAXED_MS`（2 分钟），数据变更后请 **`invalidateQueries`**。
