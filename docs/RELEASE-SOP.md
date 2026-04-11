# FastGC WhatsApp 工作台 — 桌面客户端发版 SOP

## 一、版本号规则

| 格式 | 示例 | 含义 |
|------|------|------|
| `MAJOR.MINOR.PATCH` | `1.2.0` | 主版本.功能版本.修复版本 |

- **MAJOR** — 重大架构变更、不兼容的协议升级
- **MINOR** — 新增功能、UI 改版
- **PATCH** — Bug 修复、小幅优化

版本号唯一来源：`package.json` → `version` 字段。
前端 `__APP_VERSION__`、桌面端 `app.getVersion()` 均自动读取此值。

---

## 二、发版前检查清单

- [ ] 确认所有代码已合并到发版分支
- [ ] 本地 `npm run build` 无报错
- [ ] 本地 `npm run lint` 无新增错误
- [ ] 功能已在开发环境验证通过
- [ ] 更新日志已记录（建议写在 commit message 中）

---

## 三、发版步骤

### Step 1：修改版本号

```bash
# 编辑 package.json，修改 version 字段
# 例：1.1.4 → 1.2.0
```

### Step 2：一键构建 + 上传

```powershell
npm run release:electron
```

此命令执行 `scripts/build-release.ps1`，自动完成：

1. TypeScript 编译（`electron/`）
2. Vite 构建前端（`VITE_BUILD_TARGET=electron`）
3. `winCodeSign` 缓存预处理
4. `electron-builder` 生成 NSIS 安装包 + `latest.yml` + `blockmap`
5. SCP 上传到服务器 `https://admin.crm.fastgc.cc/downloads/`
   - `FastGC-WhatsApp-Setup-{version}.exe`
   - `FastGC-WhatsApp-Setup-{version}.exe.blockmap`（差分更新）
   - `latest.yml`（更新检测入口）
6. 更新数据库 `shared_data_store` 中的下载链接

### Step 3：验证

1. 浏览器打开 `https://admin.crm.fastgc.cc/downloads/latest.yml`
   - 确认 `version` 与新版本一致
   - 确认 `sha512` 和 `size` 正确
2. 下载安装包确认可用
3. 启动旧版客户端，等待 30 秒确认弹出更新提示

---

## 四、仅构建（不上传）

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -SkipUpload
```

产物路径：`release/FastGC-WhatsApp-Setup-{version}.exe`

## 五、仅上传（已有构建产物）

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -SkipBuild
```

---

## 六、自动更新机制

### 更新源

| 文件 | 地址 | 缓存策略 |
|------|------|----------|
| `latest.yml` | `https://admin.crm.fastgc.cc/downloads/latest.yml` | `no-cache, no-store` |
| 安装包 `.exe` | `https://admin.crm.fastgc.cc/downloads/FastGC-WhatsApp-Setup-{v}.exe` | `public, max-age=86400` |
| 差分包 `.blockmap` | `https://admin.crm.fastgc.cc/downloads/FastGC-WhatsApp-Setup-{v}.exe.blockmap` | `public, max-age=86400` |

### 检测策略

| 条件 | 行为 |
|------|------|
| 生产模式（`app.isPackaged = true`） | 启动后 30 秒首次检测，之后每 4 小时轮检 |
| 开发模式 | 跳过（设 `ELECTRON_UPDATER_TEST=1` 可强制启用） |
| 用户手动 | 「系统设置 → 版本更新 → 检查更新」按钮 |

### 更新流程

```
启动 → 30s → 检测 latest.yml → 发现新版本
  → 自动后台下载（有 blockmap 时差分下载）
  → 下载完成弹窗提示
  → 用户点击「立即重启」→ 静默安装 → 自动重启
  → 或选择「稍后」→ 下次退出时自动安装
```

### 安装模式

- **oneClick: true** — 静默安装，用户无需选择目录
- 安装位置：`%LOCALAPPDATA%\fastgc-whatsapp\`（perMachine=false，无需管理员权限）

---

## 七、差分更新说明

`electron-builder` 构建时自动生成 `.blockmap` 文件，`electron-updater` 在以下条件下启用差分下载：

1. 服务器上存在 `{filename}.blockmap`
2. 客户端本地已安装上一个版本的 `.blockmap`
3. `latest.yml` 中的 `sha512` 与服务器文件一致

差分更新通常可将 ~130MB 安装包的下载量缩减至 **5-20MB**（取决于代码变更量）。

---

## 八、回滚方案

如发布版本有严重问题：

1. 修改 `package.json` 版本号为更高的修复版本（如 `1.2.1`）
2. 修复问题后重新执行 `npm run release:electron`
3. 旧版客户端会自动检测到新版本并更新

> 注意：`allowDowngrade = false`，不能发布比当前版本号更低的版本。

---

## 九、日志排查

| 位置 | 路径 |
|------|------|
| 桌面端主进程日志 | `%APPDATA%\FastGC WhatsApp 工作台\logs\main.log` |
| 自动更新日志关键词 | `[updater] checking-for-update`、`update-available`、`download-progress`、`update-downloaded`、`error` |
| 构建日志 | 构建时控制台输出 |
| 服务器文件 | `ssh server "ls -la /var/www/gc-app/dist/downloads/"` |

---

## 十、Nginx 配置（已部署）

```nginx
location = /downloads/latest.yml {
    root /var/www/gc-app/dist;
    try_files $uri =404;
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    add_header Pragma "no-cache" always;
    add_header Expires "0" always;
    add_header Content-Type "text/plain; charset=utf-8" always;
}

location ~ ^/downloads/.*\.(exe|blockmap)$ {
    root /var/www/gc-app/dist;
    try_files $uri =404;
    add_header Cache-Control "public, max-age=86400" always;
}
```

---

## 十一、发版命令速查

```bash
# 完整发版（构建 + 上传 + 更新DB）
npm run release:electron

# 仅构建
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -SkipUpload

# 仅上传已有产物
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -SkipBuild

# 开发模式下测试自动更新
set ELECTRON_UPDATER_TEST=1 && npm run electron:dev
```
