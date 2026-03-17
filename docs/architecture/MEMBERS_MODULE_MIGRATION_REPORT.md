# Members 模块 Supabase → API 迁移报告

> 完成时间：2025-03  
> 阶段：第四阶段 - Members 模块迁移

---

## 一、已迁移文件列表

| 文件 | 变更 |
|------|------|
| `src/hooks/useMembers.ts` | 移除 supabase，改用 membersApiService（fetchMembersFromDb、addMember、updateMember、updateMemberByPhone、deleteMember） |
| `src/services/members/membersApiService.ts` | **新增**，封装 listMembersApi、getMemberByIdApi、createMemberApi、updateMemberApi、updateMemberByPhoneApi、deleteMemberApi、listReferralsApi、bulkCreateMembersApi |
| `src/services/members/index.ts` | 导出 membersApiService |
| `src/pages/ActivityReports.tsx` | supabase.from('members') → listMembersApi |
| `src/services/export/orderImportService.ts` | supabase.from('members') → listMembersApi |
| `src/services/export/memberImportService.ts` | supabase.from('members') insert/update/select → membersApiService |
| `server/src/modules/members/repository.ts` | 新增 getById、create、update、updateByPhone、delete、listReferrals、bulkCreate |
| `server/src/modules/members/service.ts` | 新增对应 service 方法 |
| `server/src/modules/members/controller.ts` | 新增 getById、create、update、updateByPhone、delete、listReferrals、bulkCreate 控制器 |
| `server/src/modules/members/routes.ts` | 新增路由 |
| `server/src/modules/members/types.ts` | 新增 CreateMemberBody、UpdateMemberBody、BulkCreateMemberItem、ReferralRelation |

---

## 二、替换调用数量

| 类型 | 替换前 | 替换后 |
|------|--------|--------|
| supabase.from('members') | 11 | 0 |
| supabase.from('referral_relations') | 1 | 0 |
| tenantService RPC (getTenantMembersFull, getMyTenantMembersFull) | 2 | 0 |
| **合计** | **14** | **0** |

---

## 三、新 API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/members | 会员列表（支持 tenant_id、page、limit） |
| GET | /api/members/referrals | 推荐关系列表 |
| GET | /api/members/:id | 单个会员详情 |
| POST | /api/members | 创建会员 |
| POST | /api/members/bulk | 批量创建会员 |
| PUT | /api/members/:id | 更新会员 |
| PUT | /api/members/by-phone/:phone | 按手机号更新会员 |
| DELETE | /api/members/:id | 删除会员（级联：orders、points_ledger、activity_gifts、member_activity） |

---

## 四、剩余 Supabase 调用数量（members 相关）

以下文件仍使用 Supabase，但属于**其他模块**或**数据管理**，不在本次 members 核心迁移范围内：

| 文件 | 调用 | 说明 |
|------|------|------|
| DataManagementTab.tsx | members、member_activity | 数据归档/清理，建议后续 /api/data/archive |
| OperationLogs.tsx | member_activity | 操作日志关联 |
| useActivityDataContent.ts | member_activity | 活动数据 |
| balanceLogService.ts | member_activity | 余额日志 |
| pointsService.ts | member_activity | 积分服务（insert） |

**members 表**：DataManagementTab 中 2 处（select、delete）待后续数据管理模块迁移。

---

## 五、修改的 Hooks

| Hook | 变更 |
|------|------|
| useMembers | 完全迁移至 API，fetchMembersFromDb、addMember、updateMember、updateMemberByPhone、deleteMember 均通过 membersApiService |

**说明**：项目中无独立的 `useMember`、`useMemberList`，会员数据统一通过 `useMembers` 获取。

---

## 六、系统验证结果

| 验证项 | 状态 |
|--------|------|
| 前端构建 | ✅ 通过 |
| 后端构建 | ✅ 通过 |
| 会员列表加载 | 待运行时验证 |
| 会员详情加载 | 待运行时验证 |
| 会员创建 | 待运行时验证 |
| 会员更新 | 待运行时验证 |
| 会员删除 | 待运行时验证 |
| 会员导入（批量） | 待运行时验证 |
| 订单导入（members 映射） | 待运行时验证 |

**验证步骤**：
1. 启动后端：`cd server && npm run dev`
2. 启动前端：`npm run dev`
3. 登录后测试：会员管理列表、新增、编辑、删除、导入

---

## 七、依赖说明

- **Auth**：API 仍依赖 Supabase Auth 的 JWT（`getAuthToken` 从 session 取），迁移期保留
- **tenant_id**：会员 API 从 `req.user.tenant_id` 获取，平台管理员查看租户时可通过 `?tenant_id=` 指定
