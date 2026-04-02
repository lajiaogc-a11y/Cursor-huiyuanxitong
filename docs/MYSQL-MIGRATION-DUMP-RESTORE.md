# MySQL 整站迁移：导出与恢复

## 1. 导出方案（推荐）

### A. 管理后台（浏览器）

**系统设置 → 数据导入导出 →「MySQL 完整备份（mysqldump）」**

- **完整**：结构 + 数据 + 存储过程 + 触发器（`mysqldump` 默认能力范围内）。
- **仅结构** / **仅数据**：对应 `mysqldump --no-data` / `--no-create-info`。
- 权限：**平台总管理员** 或 **租户管理员且 `is_super_admin`**。
- 审计：写入 `operation_logs`（`operation_type = mysql_mysqldump`）。

### B. 命令行（大库强烈推荐）

服务器需已安装 **MySQL Client**（含 `mysqldump`），且 API 进程能执行该二进制（`PATH` 或 `MYSQLDUMP_PATH`）。

```bash
# 将 <TOKEN> 换为员工 JWT（与浏览器登录一致）
curl -L -o backup_full.sql \
  -H "Authorization: Bearer <TOKEN>" \
  "https://你的API域名/api/admin/database/mysql-dump?mode=full"
```

`mode`：`full` | `schema` | `data`

## 2. 导入 / 恢复方案

### 前提

- 目标机安装 **MySQL 8.x**（或与源库主版本兼容）。
- **先停** 指向该库的 Node API，避免恢复过程中写入。
- 新建空库或使用已有库（与 dump 中 `CREATE DATABASE` / `--databases` 一致）。

### 恢复命令（典型）

`mysqldump` 使用 `--databases <库名>` 时，文件中包含建库语句，可在空实例上执行：

```bash
mysql -h 新主机 -P 3306 -u root -p < backup_full.sql
```

或先建库再导入：

```sql
CREATE DATABASE gc_member_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
mysql -h 新主机 -P 3306 -u root -p gc_member_system < backup_full.sql
```

（若 SQL 内已含 `USE`/`CREATE DATABASE`，按文件实际内容调整。）

### 顺序

- **full**：单文件一次执行即可。
- **schema** → **data**：先 schema，再 data（同一库）。

## 3. 应用与配置迁移

1. 复制仓库、配置 **新** `server/.env`：`MYSQL_*`、`JWT_SECRET`、生产 `NODE_ENV`、`TRUST_PROXY=1`、`CORS_ALLOWED_ORIGINS` 等。
2. 前端构建变量 **`VITE_API_BASE`** 指向新 API。
3. 启动 API（会自动跑部分 `migrate*.ts` 补列）；**若库已由 mysqldump 完整恢复，迁移脚本应为空操作或幂等**。
4. **文件/上传**：若使用本地磁盘或对象存储，需单独同步 `upload` 目录或桶内对象，并更新库中 URL/路径字段（如有）。

## 4. 安全说明

- 导出文件含**全库敏感数据**，传输应用 **HTTPS**，落地加密保管。
- 冷却时间由 `DUMP_MIN_INTERVAL_MS` 控制（默认 120s）。
- 非授权角色返回 **403**。

## 5. 大数据量

- 服务端 **stdout 流式** 输出，不在 Node 内整库缓冲。
- 浏览器仍会整段 `blob` 保存，**超大库请用 curl** 直接落盘。
- 可配合 `gzip`：`curl ... | gzip -c > backup.sql.gz`（需自行解压后导入）。

## 6. 验证恢复成功

```sql
SELECT COUNT(*) FROM members;
SELECT COUNT(*) FROM orders;
SHOW TABLES;
```

对比导出前记录数；抽样登录员工端/会员端关键流程。

## 7. 与「ZIP 兼容导出」区别

设置页中 **「兼容导出（ZIP）」** 为历史逻辑（PostgreSQL 风格片段 + 逐表 API），**不能**保证与当前 MySQL 线上结构 100% 一致。**生产迁移请以 mysqldump 为准。**

## 8. 一键导入 Web 接口

**未提供**「浏览器上传 SQL 并执行」：风险极高（SQL 注入、误删库）。导入请在 **受控主机** 上用 `mysql` 客户端或 DBA 工具执行。

## 9. 线上 MySQL → 本地 MySQL（脚本）

仓库提供 `scripts/sync-mysql-remote-to-local.mjs`（npm：`npm run db:sync:pull`）：

1. 复制 `server/.env.sync.example` → `server/.env.sync`，填写 **线上** RDS 的 `SOURCE_DATABASE_URL` 或 `SOURCE_MYSQL_*`（该文件已在 `.gitignore`，勿提交）。
2. `server/.env` 保持 **本地** 的 `DATABASE_URL` 或 `MYSQL_*`。
3. 本机安装 MySQL Client（`mysqldump` + `mysql`），或设置 `MYSQLDUMP_PATH` / `MYSQL_CLIENT_PATH`。
4. 建议先停止本地 Node API，再执行：`npm run db:sync:pull -- --dry-run` 核对源/目标，确认后 `npm run db:sync:pull -- --yes`。

脚本会拒绝「源与目标主机+库+用户完全相同」的请求，避免误覆盖线上。
