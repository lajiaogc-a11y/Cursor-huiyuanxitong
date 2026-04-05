# Supabase Migrations

## 2026-04 清理说明

原始 230 个 Postgres 迁移文件已清理为 85 个。

**清理规则**：仅保留被 `scripts/run-*.mjs` 脚本通过 `readFileSync` 直接引用的 SQL 文件。
无任何脚本引用的 145 个历史迁移文件已删除（SQL 早已在线上 Postgres 数据库执行完毕）。

**对生产环境的影响**：**无**。
- 部署脚本 `deploy-full.ps1` 不读取这些迁移文件
- 线上数据库的表/函数/RLS 策略不受影响
- 删除本地文件 ≠ 删除数据库中的数据

**保留的文件**（85 个）：均为 `scripts/` 下一次性迁移工具所引用，包含：
- 2 个非时间戳文件：`run-fixes.sql`、`run_tenant_safe_rpcs.sql`
- 83 个时间戳迁移（2026-03-09 ~ 2026-04-20）

如需恢复已删除的迁移文件，请从 Git 历史中检出。

---

## 迁移修复说明：订单统计 + 仪表盘交易用户

### 方式一：Supabase SQL Editor（推荐，无需配置）

1. 打开 [Supabase SQL Editor](https://supabase.com/dashboard/project/dhlwefrcowefvbxutsmc/sql/new)
2. 打开项目中的 `supabase/migrations/run-fixes.sql` 文件
3. 全选复制其内容（Ctrl+A, Ctrl+C）
4. 粘贴到 SQL Editor 的输入框
5. 点击 **Run** 执行
6. 看到 "Success" 即表示完成

### 方式二：命令行脚本（需配置数据库连接）

1. 在 Supabase 控制台获取数据库连接字符串：
   - 打开 [Database Settings](https://supabase.com/dashboard/project/dhlwefrcowefvbxutsmc/settings/database)
   - 在 "Connection string" 区域选择 "URI"
   - 复制并替换 `[YOUR-PASSWORD]` 为你的数据库密码

2. 在项目根目录 `.env` 文件中添加：
   ```
   DATABASE_URL=postgresql://postgres.xxx:你的密码@aws-0-xx.pooler.supabase.com:6543/postgres
   ```

3. 运行迁移：
   ```bash
   npm run db:migrate-fixes
   ```

### 修复内容

- **订单管理**：卡值总和、利润总和正确统计（当 amount 为空时使用 card_value × exchange_rate）
- **仪表盘**：交易用户数正确统计（修复 sales_user_id 为 NULL 时订单被错误排除的问题）
