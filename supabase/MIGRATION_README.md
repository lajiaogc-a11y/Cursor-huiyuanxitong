# 迁移修复说明：订单统计 + 仪表盘交易用户

## 方式一：Supabase SQL Editor（推荐，无需配置）

1. 打开 [Supabase SQL Editor](https://supabase.com/dashboard/project/dhlwefrcowefvbxutsmc/sql/new)
2. 打开项目中的 `supabase/migrations/run-fixes.sql` 文件
3. 全选复制其内容（Ctrl+A, Ctrl+C）
4. 粘贴到 SQL Editor 的输入框
5. 点击 **Run** 执行
6. 看到 "Success" 即表示完成

## 方式二：命令行脚本（需配置数据库连接）

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

## 修复内容

- **订单管理**：卡值总和、利润总和正确统计（当 amount 为空时使用 card_value × exchange_rate）
- **仪表盘**：交易用户数正确统计（修复 sales_user_id 为 NULL 时订单被错误排除的问题）
