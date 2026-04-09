# 数据库空间清理建议

执行 `diagnose-db-size.sql` 后，根据结果判断主要占用来源，再考虑以下清理方式。

---

## 一、按占用类型处理

### 1. Storage 存储桶（文件占用大）

- **检查**：Supabase 控制台 → Storage → 各 bucket
- **常见大桶**：`task-posters`（任务海报图）、`avatars` 等
- **操作**：删除无用文件；可设置生命周期策略限制旧文件

### 2. 日志 / 临时类表（可安全清理）

| 表名 | 说明 | 清理建议 |
|------|------|----------|
| `otp_verifications` | 验证码记录 | 删除 N 天前的过期记录 |
| `api_rate_limits` | 限流记录 | 删除 N 天前的记录 |
| `error_reports` | 错误上报 | 按需保留最近 N 天 |

**示例 SQL（清理 30 天前的 OTP）：**
```sql
DELETE FROM otp_verifications WHERE expires_at < NOW() - INTERVAL '30 days';
```

### 3. 业务数据（需谨慎）

- **orders、members、spins、redemptions** 等：业务核心数据，不建议随意删除
- 若有归档需求：可把旧数据导出后删除，或迁到冷存储
- **data_backups**：若存了大字段备份，可评估保留策略后清理旧备份

### 4. 死行 / 膨胀（VACUUM）

若诊断中「死行数」较多：
```sql
VACUUM ANALYZE;
```

或对单表：`VACUUM ANALYZE orders;`

---

## 二、Supabase 控制台中的查看入口

- **Database**：Settings → Database → 查看数据库总大小
- **Storage**：Storage → 各 bucket 的用量
- **日志 / 用量**：Project Settings → Usage 或 Billing

---

## 三、升级方案

若清理后仍超限，可考虑：
- 升级 Supabase 套餐（提高数据库与存储限额）
- 将大表/旧数据迁到自建或其他云数据库做归档
