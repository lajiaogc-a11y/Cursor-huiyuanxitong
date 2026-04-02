# 前端 API 迁移报告（第二阶段）

> 完成时间：2025-03  
> 目标：彻底移除前端 Supabase 依赖，统一通过 API 与后端通信

---

## 一、已迁移文件列表

| 文件 | 迁移内容 | 替换数量 |
|------|----------|----------|
| `src/services/points/memberPointsRpcService.ts` | 3 个 `supabase.rpc` → `apiGet` | 3 |
| `src/api/client.ts` | 新增 401/403/500 统一错误处理、token 存储 | - |
| `src/api/init.ts` | 新增 API 错误拦截器初始化 | - |
| `src/api/index.ts` | 导出 apiPut、apiDelete、错误处理 | - |
| `src/main.tsx` | 调用 initApiClient | - |
| `server/src/modules/points/*` | 新增 breakdown、spin-quota 端点 | - |

**间接迁移**（通过 memberPointsRpcService 使用 API）：
- `src/hooks/useMemberPoints.ts`
- `src/hooks/useMemberPointsBreakdown.ts`
- `src/hooks/useMemberSpinQuota.ts`

---

## 二、替换 Supabase 调用数量

| 模块 | 替换前 | 替换后 |
|------|--------|--------|
| points (memberPointsRpcService) | 3 | 0 |
| **合计** | **3** | **0** |

---

## 三、剩余 Supabase 调用统计

| 层级 | 文件数 | 代表文件 | 调用数量 |
|------|--------|----------|----------|
| services | 20 | tenantService, tenantQuotaService, sharedDataService | ~80 |
| hooks | 15 | useMembers, useMerchantConfig, useActivityDataContent | ~60 |
| components | 15 | DataManagementTab, RateCalculator, MemberActivityDataContent | ~100 |
| stores | 5 | activitySettingsStore, merchantConfigStore | ~15 |
| pages | 12 | MerchantSettlement, OperationLogs, ActivityReports | ~30 |
| contexts | 2 | AuthContext, MemberAuthContext | ~17 |
| api/client | 1 | getAuthToken 兼容（迁移期） | 1 |

**总计**：约 60+ 文件，**约 300+ 处** Supabase 调用待迁移。

**高耦合文件**（优先迁移）：
- `DataManagementTab.tsx`：约 67 次
- `tenantService.ts`：约 20 次
- `useMerchantConfig.ts`：约 20 次
- `memberPortalSettingsService.ts`：约 14 次
- `AuthContext.tsx`：约 14 次

---

## 四、新 API 调用结构

### 4.1 API 客户端

```
src/api/
├── client.ts
│   ├── apiGet(path)
│   ├── apiPost(path, body)
│   ├── apiPut(path, body)
│   ├── apiDelete(path)
│   ├── setAuthToken(token)
│   ├── clearAuthToken()
│   └── 错误拦截：setOnUnauthorized, setOnForbidden, setOnServerError
├── init.ts
│   └── initApiClient() - 401 跳转登录、403/500 toast
└── index.ts
```

### 4.2 已实现 API 端点

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | /api/auth/login | 否 | 登录 |
| GET | /api/members | 是 | 会员列表 |
| GET | /api/points/member/:memberId | 是 | 会员积分 |
| GET | /api/points/member/:memberId/breakdown | 是 | 会员积分分类 |
| GET | /api/points/member/:memberId/spin-quota | 是 | 会员抽奖次数 |
| GET | /api/giftcards | 是 | 礼品卡列表 |
| GET | /api/orders | 是 | 订单列表 |
| GET | /api/whatsapp | 是 | 聊天列表（预留） |

### 4.3 调用示例

```typescript
// 旧（Supabase）
const { data } = await supabase.rpc('member_get_points', { p_member_id: memberId });

// 新（API）
const res = await apiGet<{ success: boolean; data: MemberPointsResult }>(
  `/api/points/member/${encodeURIComponent(memberId)}`
);
const result = res.data;
```

---

## 五、修改后的系统结构

```
Frontend (React)
    │
    ├── src/api/
    │   ├── client.ts    ← 统一 API 调用，401/403/500 拦截
    │   ├── init.ts      ← 错误处理初始化
    │   └── index.ts
    │
    ├── src/services/points/memberPointsRpcService.ts  ← 已迁移，使用 apiGet
    │
    └── src/integrations/supabase/  ← 保留（迁移期：auth token + Realtime）
            │
            ▼
    API (http://localhost:3001)
            │
            ├── /api/auth
            ├── /api/members
            ├── /api/points
            ├── /api/giftcards
            ├── /api/orders
            └── /api/whatsapp
            │
            ▼
    Backend (server/)
            │
            ├── Controller → Service → Repository → Database
            └── Supabase (service role)
```

---

## 六、后续迁移建议

### 6.1 按模块迁移顺序

1. **members**：useMembers → 需后端 /api/members/full、/api/members/referrals
2. **giftcards**：merchantConfigReadService、useActivityGifts → 需 /api/giftcards
3. **orders**：orderQueries、tenantService → 需 /api/orders/full
4. **points**：✅ 已完成 memberPointsRpcService
5. **whatsapp**：预留
6. **auth**：AuthContext → 需 /api/auth/login、/api/auth/me、logout

### 6.2 迁移步骤

1. 后端新增对应端点
2. 前端新增 service 层调用 apiGet/apiPost
3. 替换 hooks/components 中的 supabase 调用
4. 验证功能并移除 Supabase 引用

### 6.3 注意事项

- **auth 迁移期**：api/client 的 getAuthToken 仍从 Supabase session 获取，确保 API 调用带 token
- **Realtime**：Supabase Realtime 可暂时保留，或后续由后端 WebSocket 替代
- **VITE_API_BASE**：生产环境需配置指向后端地址

### 6.4 详细迁移计划

完整扫描结果与按模块迁移计划见：[SUPABASE_MIGRATION_PLAN.md](./SUPABASE_MIGRATION_PLAN.md)
