# 服务器 SSH 部署（更新源码 + 前后端构建 + PM2）

把下面 **「发给我（Agent）时要写清的内容」** 填好，或在 **已 SSH 登录的服务器** 上直接执行文末脚本。

---

## 1. 发给我（Cursor Agent）时要附带的信息

复制下面一段，**把括号改成你的真实值** 再发送：

```text
Agent 模式，请在【已 SSH 登录的 Linux 服务器】上部署（若当前终端未 SSH，请先说明）：

- 服务器项目绝对路径：【例如 /var/www/gift-system】
- Git 远程与分支：【例如 origin main】
- 是否已在本终端 SSH 登录服务器：【是 / 否】
- PM2：【restart ecosystem.config.cjs --update-env】或【restart gc-api --update-env】或【restart all】
- 前端构建：npm ci && npm run build（根目录）
- 后端构建：cd server && npm ci && npm run build
```

**说明：**

- 若 **否** 已 SSH：我只能在你 **本机 Windows** 执行命令，**无法替你登录服务器**；我会给你「在服务器上复制执行」的命令清单。
- 生产环境依赖建议用 **`npm ci`**（需提交 `package-lock.json`）；若没有 lock 文件可改为 `npm install`。

---

## 2. 本仓库默认约定

| 项目 | 说明 |
|------|------|
| 前端 | 仓库根目录 `npm run build` → 产出 `dist/` |
| 后端 | `server/` 下 `npm run build` → 产出 `server/dist/`（若你用 `tsc`） |
| PM2 | 根目录有 `ecosystem.config.cjs`，应用名 **`gc-api`**，`cwd` 为 `./server` |
| 生产启动 | 当前 ecosystem 使用 `node --import tsx src/app.ts`；若你已改为编译后启动，请把 `ecosystem.config.cjs` 改成 `node dist/app.js` 再部署 |

---

## 3. 在服务器上手动执行（一键脚本）

仓库内脚本：**`scripts/deploy-server.sh`**

```bash
# 在服务器上（已 clone 的目录旁或项目内）
chmod +x scripts/deploy-server.sh
export DEPLOY_PATH=/你的/项目绝对路径   # 可选，默认当前目录
export GIT_BRANCH=main                   # 可选，默认 main
./scripts/deploy-server.sh
```

或直接打开脚本，修改顶部的 `DEPLOY_PATH`、`GIT_REMOTE`、`GIT_BRANCH` 后执行。

---

## 4. 发给 AI 的极简一行版（示例）

```text
已 SSH 到服务器。路径 /var/www/gc-app，分支 main，执行：git pull、根目录与 server 的 npm ci + build、pm2 restart ecosystem.config.cjs --update-env
```

把路径和分支换成你的即可。
