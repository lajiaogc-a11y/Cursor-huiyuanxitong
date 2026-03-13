# 项目目录结构 (Project Structure)

> 排除：node_modules、dist、build、.next

## 根目录

```
Cursor-huiyuanxitong-main/
├── .lovable/              # Lovable 配置与计划
├── .wrangler/             # Cloudflare Wrangler 临时文件
├── docs/                  # 项目文档
├── electron/               # Electron 桌面应用入口
├── public/                # 静态资源
├── scripts/               # 部署与迁移脚本
├── src/                   # 前端源码
├── supabase/              # Supabase 配置与迁移
├── .env, .env.example     # 环境变量
├── package.json           # 依赖与脚本
├── vite.config.ts         # Vite 构建配置
├── tailwind.config.ts     # Tailwind CSS 配置
├── wrangler.toml          # Cloudflare Pages 配置
└── README.md
```

## src/ 目录结构

```
src/
├── components/            # 可复用 UI 组件
│   ├── dialogs/           # 弹窗组件
│   ├── empty-state/       # 空状态展示
│   ├── exchange-rate/     # 汇率相关组件
│   ├── layout/            # 布局（Sidebar, Header, MainLayout, AdminLayout）
│   ├── member/            # 会员端专用组件
│   ├── merchant-settlement/# 商户结算组件
│   ├── orders/            # 订单相关组件
│   ├── report/            # 报表组件
│   ├── skeletons/         # 骨架屏
│   └── ui/                # 通用 UI（shadcn/ui）
├── config/                # 应用配置（币种、常量）
├── contexts/              # React Context（Auth, Theme, Language, Tenant 等）
├── hooks/                 # 自定义 Hooks（数据获取、业务逻辑）
├── integrations/          # 第三方集成（Supabase client、types）
├── lib/                   # 工具函数（utils, queryClient, lazyWithRetry）
├── locales/               # 国际化文案
├── pages/                 # 页面组件（路由对应）
├── services/              # 业务服务层（API、RPC、数据处理）
├── stores/                # Zustand 状态管理
├── styles/                # 全局样式
└── test/                  # 测试
```

## 各目录用途

| 目录 | 用途 |
|------|------|
| **components** | 可复用 UI 组件，按业务域分子目录 |
| **config** | 币种、常量等静态配置 |
| **contexts** | 全局状态与依赖注入（Auth、Theme、Language、TenantView、Realtime） |
| **hooks** | 封装数据获取、业务逻辑，供页面/组件复用 |
| **integrations** | Supabase 客户端、类型定义 |
| **lib** | 纯工具函数，无业务依赖 |
| **locales** | 中英文翻译 |
| **pages** | 路由对应的页面，懒加载 |
| **services** | 与后端/数据库交互的业务服务 |
| **stores** | Zustand 状态（汇率、订单、积分、商户配置等） |
| **styles** | index.css、主题变量 |
| **docs** | 设计文档、部署说明 |
| **scripts** | 数据库迁移、部署、恢复脚本 |
| **supabase/migrations** | 数据库迁移 SQL（约 170+ 个） |
| **public** | favicon、manifest、PWA 资源 |
