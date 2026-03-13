# 系统初始化流程 (System Initialization)

## 1. 入口

```
main.tsx
  → createRoot(document.getElementById("root")).render(<App />)
  → initWebVitals()  // 生产环境 Web 性能采集
```

---

## 2. App 组件树

```
App
├── QueryClientProvider
├── ThemeProvider
├── LanguageProvider
├── LayoutProvider
├── AuthProvider
│   ├── MemberAuthProvider
│   ├── RealtimeProvider
│   ├── AppRouter (HashRouter/BrowserRouter)
│   │   ├── TenantViewProvider
│   │   ├── SharedDataTenantProvider
│   │   └── Routes (Suspense + lazy pages)
│   ├── UpdatePrompt
│   └── Sonner (toast)
```

---

## 3. Supabase 初始化

- **位置**：`src/integrations/supabase/client.ts`
- **配置**：`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- **创建**：`createClient<Database>(url, key, { auth: { storage: localStorage, persistSession: true, autoRefreshToken: true } })`
- **校验**：`isValidSupabaseConfig()` 检测占位符，无效时使用 placeholder URL 避免白屏

---

## 4. Auth 初始化（AuthContext）

### 4.1 初始化流程

1. **挂载**：`AuthProvider` 挂载
2. **`supabase.auth.onAuthStateChange`**：监听登录/登出
3. **`supabase.auth.getSession()`**：获取当前会话
4. **有会话**：
   - `fetchEmployeeInfo(user.id)`：profiles → employee_id → RPC `get_my_employee_info` 或 employees 表
   - `syncUserData(user.id)`：并行执行
     - `initializeUserDataSync`
     - `ensureDefaultSharedData`
     - `initNameResolver`
     - `preloadSharedData`
     - `queryClient.prefetchQuery`（employees, cards, vendors, payment_providers, activity-types, members）
5. **无会话**：`setLoading(false)`，立即完成

### 4.2 员工信息获取

- 优先：`profiles` 表取 `employee_id` → RPC `get_my_employee_info`
- 回退：`employees` 表直接查询
- 结果：`employee`（id, username, real_name, role, status, is_super_admin, tenant_id）

### 4.3 权限加载

- 表：`role_permissions`
- Realtime：订阅 `role_permissions` 变更

### 4.4 登录流程（signIn）

1. `verify_employee_login_detailed` 验证账号
2. IP 国家校验（`checkIpAccess` → data_settings.ip_access_control）
3. `supabase.auth.signInWithPassword` 登录
4. 失败时 `syncAuthPassword` 同步密码后重试
5. `profiles` upsert（id, employee_id, email）
6. `log_employee_login` 记录登录
7. `initializeReferralCache`, `setOperatorCache`, `initNameResolver`

---

## 5. 应用初始化（AppInitializer）

- **触发**：登录后或需要时调用 `initializeApp()`
- **步骤**：
  1. `ensureDefaultSharedData()`：shared_data_store 默认配置
  2. `initializePointsSettings()`：积分设置缓存
  3. `initializeCopySettings()`：复制设置
  4. `loadSharedData('btcPriceSettings')`
  5. `initializeCacheManager()`：Realtime 订阅

---

## 6. 路由

- **生产**：`HashRouter`（Cloudflare Pages 兼容）
- **开发**：`BrowserRouter`
- **Electron/Capacitor**：`HashRouter`

---

## 7. 懒加载

- 页面使用 `lazy()` 或 `lazyWithRetry()`
- `Suspense` + `TopProgressBar` 作为 fallback
