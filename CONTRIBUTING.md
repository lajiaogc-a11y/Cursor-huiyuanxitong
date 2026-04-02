# 贡献指南

## 代码风格与类型

- **禁止在新代码中新增 `any`**（含 `as any`、显式 `: any`）。沿用既有类型或 `unknown` + 收窄；确需与遗留接口对接时在本文件内集中封装并加简短注释。
- **PR 必须通过增量 ESLint**（见下文）。CI 中 `lint-incremental` 为必过项；全仓 `npm run lint` 为信息类，用于逐步还债，不阻塞合并。

### 提交与 lint-staged（pre-commit）

**以后同类提交：**

- **正常：** `git add …` → `git commit …`（会跑 **lint-staged**）。
- **触及文件仍有历史 ESLint 债、本次不打算全修：** 跳过本地 pre-commit 中的 ESLint，**后续 PR 里再逐步清 lint**。
  - **PowerShell：** `$env:SKIP_LINT_STAGED="1"; git commit …`
  - **Bash / Git Bash：** `SKIP_LINT_STAGED=1 git commit …`

仍应优先尝试修复当前暂存文件中的问题；仅在确有需要时使用跳过。

## 本地常用命令

| 命令 | 说明 |
|------|------|
| `npm run lint:staged` | 对已 `git add` 的 `.ts`/`.tsx` 跑 ESLint（与 pre-commit 一致） |
| `npm run lint:since-main` | 相对 `origin/main` 的变更文件（适合本地对照主分支） |
| `npm run lint:incremental` | 相对上一提交 `HEAD~1` 的变更文件 |
| `npm run lint` | 全仓 ESLint（遗留问题多，作参考） |

## GitHub Actions

工作流 `.github/workflows/architecture.yml`（workflow 显示名为 **ci-gate**）：

- **lint-incremental**（job 显示名 **`ESLint (changed .ts/.tsx only)`**）：对 PR / push 变更范围内的 TypeScript 执行 ESLint，**失败则 CI 失败**。
- **lint-full**（**`ESLint (full repo, informational)`**）：全仓 `npm run lint`，`continue-on-error: true`，仅作报表、**不阻塞合并**。

### 在 GitHub 上把增量 ESLint 设为必过（仓库管理员）

分支保护只能由**对该仓库有管理员权限**的账号在网页上设置（机器人/本地无法代你点击）。**若你看不到「Settings」**，说明当前账号不是 Admin，需要让仓库所有者把你加成 Admin，或由对方按下面步骤操作。

**直达链接（复制到浏览器打开）：**  
https://github.com/lajiaogc-a11y/Cursor-huiyuanxitong/settings/branches

**最短步骤：**

1. 打开上面链接（或：**仓库首页 → 顶部 Settings → 左侧 Branches**）。
2. 在 **Branch protection rules** 里找到 **`main`** 那一行，点 **Edit**（没有规则就点 **Add rule**，在 **Branch name pattern** 填 `main`）。
3. 勾选 **Require status checks to pass before merging**（合并前必须通过状态检查）。
4. 在 **Status checks that are required** 的搜索框里输入 `ESLint`，勾选 **`ESLint (changed .ts/.tsx only)`**（若显示成 **`ci-gate / ESLint (changed .ts/.tsx only)`**，选它即可）。
5. 点页面底部 **Save changes** / **Create**。

**不要**把 **`ESLint (full repo, informational)`** 设为必过（全仓信息类，不用于阻塞合并）。

**可选：** 若希望整份 CI 都挡住合并，可再勾选 **`Server (build + test)`**、**`Frontend (type-check + build + test)`**、**`Architecture gate`**（名称以 Actions 里为准）。

**若搜不到检查名：** 先往 `main` 推一个任意小提交或开一个 PR，让 workflow **ci-gate** 在 GitHub 上至少**成功跑完一次**，再回到本页搜索。

**说明：** 亦可用具备 `admin:repo_hook` 等权限的 **GitHub CLI**（`gh api`）配置，需本机 `gh auth login` 且账号有管理权限；与网页效果相同。

## 发布脚本

`npm run deploy:full` **不包含** ESLint；顺序仍为：Git → `server` 构建 → 前端构建 → 上传 EC2 → PM2 重启。发布前请自行在本地或通过 CI 确认增量 lint 已通过。

## 构建告警跟踪

生产构建中的非致命告警（如 Vite chunk、历史 Tailwind 类名）记录在 [`docs/BUILD_WARNINGS.md`](docs/BUILD_WARNINGS.md)，按周消化。
