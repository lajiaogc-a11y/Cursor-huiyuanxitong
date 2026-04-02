#!/usr/bin/env bash
# 在 Linux 服务器上：拉代码 + 构建前端 + 构建 server + PM2 重启
# 用法：
#   cd /path/to/项目根目录
#   chmod +x scripts/deploy-server.sh
#   ./scripts/deploy-server.sh
# 或通过环境变量覆盖：
#   GIT_BRANCH=main GIT_REMOTE=origin ./scripts/deploy-server.sh

set -euo pipefail

GIT_REMOTE="${GIT_REMOTE:-origin}"
GIT_BRANCH="${GIT_BRANCH:-main}"
# 若从 scripts/ 内调用，自动回到仓库根
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${DEPLOY_PATH:-$(cd "$SCRIPT_DIR/.." && pwd)}"
cd "$ROOT"

echo ">>> 部署目录: $ROOT"
echo ">>> Git: $GIT_REMOTE $GIT_BRANCH"

if [ -d .git ]; then
  git fetch "$GIT_REMOTE"
  git checkout "$GIT_BRANCH"
  git pull "$GIT_REMOTE" "$GIT_BRANCH"
else
  echo "!!! 当前目录不是 git 仓库，跳过 git pull"
fi

echo ">>> 前端依赖 + 构建"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
npm run build

echo ">>> 后端依赖 + 构建"
cd server
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
npm run build
cd "$ROOT"

echo ">>> PM2 重启（需在项目根目录，且已 pm2 start 过 ecosystem）"
if [ -f ecosystem.config.cjs ]; then
  pm2 restart ecosystem.config.cjs --update-env || pm2 restart all --update-env
else
  pm2 restart gc-api --update-env || pm2 restart all --update-env
fi

echo ">>> 完成"
