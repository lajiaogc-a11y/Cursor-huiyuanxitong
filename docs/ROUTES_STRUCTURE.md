# 前端路由结构说明（礼品卡会员系统）

本文描述 `src/App.tsx` 注册的 SPA 路由如何按 **会员端 / 员工端 / 平台后台 / 公共页** 划分，以及生产环境 **域名隔离** 行为。

## 域名与入口（`src/routes/siteMode.ts`）

| 模式 | 条件 | 行为 |
|------|------|------|
| `member` | `hostname` 为 `MEMBER_HOSTS` 中配置 | 仅注册会员相关路由 + 公共页 |
| `staff` | `hostname` 为 `STAFF_HOSTS` 中配置 | 仅注册员工/平台路由 + 公共页；根路径 `/` → `/staff/login` |
| `both` | 其他（含本地开发） | 会员与员工路由同时可用 |

主机名列表与业务域名部署一致，修改时需在服务端 DNS / 反代中同步。

## 会员端（C 端礼品卡会员门户）

| 路径 | 说明 |
|------|------|
| `/` | 会员登录 |
| `/member/login` | 重定向到 `/` |
| `/member` | 重定向到 `/member/dashboard` |
| `/member/dashboard` | 会员首页（需登录） |
| `/member/spin` | 抽奖（需登录） |
| `/member/points` | 积分/兑换（需登录） |
| `/member/invite` | 邀请（需登录） |
| `/member/settings` | 设置（需登录） |
| `/invite/:code` | 邀请落地页（公开） |

布局：登录页无 `MemberLayout`；其余受保护路由外包 `MemberProtectedRoute` + `MemberLayout`。

## 员工端（租户内业务后台）

前缀：`/staff/*`（旧路径见下节「兼容重定向」）。

包含：订单、会员活动、员工、报表、系统设置、会员管理、汇率、客户查询、商家与结算、任务子模块、操作/登录日志、审计、待授权、知识库、会员门户配置等。具体路径常量见 `src/routes/constants.ts` 中 `ROUTES.STAFF`。

守卫：`AdminProtectedRoute` + `ProtectedRoute`（租户员工 JWT）。

## 平台后台（超级管理员）

仍在 `/staff/admin/*` 下，与员工端同一站点域名，但通过 `requirePlatformSuperAdmin` 限制：

| 路径 | 说明 |
|------|------|
| `/staff/admin` | 重定向到 `/staff/admin/tenants` |
| `/staff/admin/tenants` | 公司/租户管理 |
| `/staff/admin/tenant-view` | 租户视图 |
| `/staff/admin/settings` | 平台设置（默认 tab：`ip-control`） |
| `/staff/admin/settings/:tab` | 分 tab 设置页 |

## 公共页

| 路径 | 说明 |
|------|------|
| `/public-rates` | 公开汇率展示 |
| `/404` | 未找到 |

## 历史路径兼容

`LEGACY_STAFF_REDIRECTS`（`src/routes/constants.ts`）将旧版无前缀路径（如 `/login`、`/orders`、`/admin/tenants` 等）**永久重定向**到对应的 `/staff/*`，保留查询串与 hash。

另：`/admin/settings/:tab` 由 `LegacyAdminSettingsTabRedirect` 映射到 `/staff/admin/settings/:tab`。

## 相关源码文件

- `src/routes/constants.ts` — 路径常量与旧路径表
- `src/routes/siteMode.ts` — 域名模式
- `src/routes/lazyPages.tsx` — 页面懒加载
- `src/routes/RedirectRoutes.tsx` — 重定向与布局守卫组件
- `src/routes/memberStaffRouteConfig.tsx` — 会员/员工路由表（元素配置）
- `src/App.tsx` — `Routes` 组装入口
