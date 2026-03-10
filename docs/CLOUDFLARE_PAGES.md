# Cloudflare Pages 发布

仅包含发布到 Cloudflare Pages 所需的配置与步骤。

---

## 一、发布用常量（固定值）

| 项 | 值 |
|----|-----|
| Cloudflare Account ID | `a6fa9e34e1c8653d73bb0d5d6dfbb785` |
| Pages 项目名 | `gift-system` |
| 发布目录 | `dist` |
| 自定义域名 | `crm.fastgc.cc` |

---

## 二、密钥格式（仅 Cloudflare）

在项目根目录 `.env` 中配置：

```env
CLOUDFLARE_API_TOKEN="你的Token"
CLOUDFLARE_ACCOUNT_ID="a6fa9e34e1c8653d73bb0d5d6dfbb785"
```

**重要**：必须同时配置 `CLOUDFLARE_ACCOUNT_ID`，否则 wrangler 会因 memberships 权限检查失败。

---

## 三、发布步骤

```bash
npm run build
npx wrangler pages deploy dist --project-name=gift-system
```

成功后会输出地址，正式域名为 `https://crm.fastgc.cc`。

---

## 四、使用 .env 中的 Token 发布

**PowerShell (Windows):**

```powershell
Get-Content .env | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim().Trim('"'), 'Process') } }
npm run build
npx wrangler pages deploy dist --project-name=gift-system
```

**Bash (Linux/Mac):**

```bash
export $(grep -v '^#' .env | xargs)
npm run build
npx wrangler pages deploy dist --project-name=gift-system
```

---

## 五、常见问题

| 问题 | 处理 |
|------|------|
| 403 / Invalid token | 检查 `CLOUDFLARE_API_TOKEN` 是否正确或过期，必要时在 Cloudflare 重新创建 Token |
| Authentication error [10000] | Token 需包含 **User -> User Details -> Read** 和 **Account -> Cloudflare Pages -> Edit** 权限 |
| 找不到项目 | 确认项目名为 `gift-system`，Token 权限包含 Cloudflare Pages: Edit |
