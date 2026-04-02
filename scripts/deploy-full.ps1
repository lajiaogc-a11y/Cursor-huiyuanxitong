# Deploy: Git push + local builds + SCP frontend to AWS EC2 + SSH server update + PM2 restart
# SSH 私钥：在 .env 或 server\.env 设置 DEPLOY_SSH_KEY_DIR（目录内第一个 .pem）或 DEPLOY_SSH_IDENTITY_FILE
# Usage:
#   .\scripts\deploy-full.ps1 "commit message"
#   .\scripts\deploy-full.ps1 -SkipMigrate              # 跳过数据库迁移（纯前端修复时使用）
#   npm run deploy:full
#   npm run deploy:full:msg -- "commit message"
#
# MySQL schema: 通过 runAllMigrations (npm run migrate:all) 自动执行，
# 所有补丁已整合到 server/src/startup/migrateSchemaPatches.ts。
# 迁移记录表 _migrations 确保每个迁移只执行一次，不会重复破坏数据。

param(
    [string]$Message = "Update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')",
    [switch]$SkipMigrate
)

$ErrorActionPreference = "Stop"
# npm 调用 `powershell -File ./scripts/...` 时，个别环境下 $PSScriptRoot 为空，Split-Path 会得到 $null
if ($PSScriptRoot) {
    $projectRoot = Split-Path -Parent $PSScriptRoot
    Set-Location -LiteralPath $projectRoot
} else {
    $projectRoot = (Get-Location).Path
}
$projectRoot = (Resolve-Path -LiteralPath $projectRoot).Path

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Load deploy credentials + 前端构建变量（Vite 会读 .env，此处显式注入以便子进程与日志一致）
$envFiles = @(".env", "server\.env")
foreach ($ef in $envFiles) {
    if (Test-Path $ef) {
        Get-Content $ef -Encoding UTF8 | ForEach-Object {
            if ($_ -match '^DEPLOY_PM2_SSH=(.+)$') { $env:DEPLOY_PM2_SSH = $matches[1].Trim().Trim('"') }
            if ($_ -match '^DEPLOY_REMOTE_DIR=(.+)$') { $env:DEPLOY_REMOTE_DIR = $matches[1].Trim().Trim('"') }
            if ($_ -match '^DEPLOY_SSH_IDENTITY_FILE=(.+)$') { $env:DEPLOY_SSH_IDENTITY_FILE = $matches[1].Trim().Trim('"') }
            if ($_ -match '^DEPLOY_SSH_KEY_DIR=(.+)$') { $env:DEPLOY_SSH_KEY_DIR = $matches[1].Trim().Trim('"') }
            if ($_ -match '^VITE_API_BASE=(.*)$') { $env:VITE_API_BASE = $matches[1].Trim().Trim('"') }
        }
    }
}

function Get-DeploySshIdentityArg {
    $explicit = ''
    if ($env:DEPLOY_SSH_IDENTITY_FILE) { $explicit = $env:DEPLOY_SSH_IDENTITY_FILE.Trim().Trim('"') }
    if ($explicit -and (Test-Path -LiteralPath $explicit -PathType Leaf)) {
        return @('-i', (Resolve-Path -LiteralPath $explicit).Path)
    }
    $dir = ''
    if ($env:DEPLOY_SSH_KEY_DIR) { $dir = $env:DEPLOY_SSH_KEY_DIR.Trim().Trim('"') }
    if ($dir -and (Test-Path -LiteralPath $dir -PathType Container)) {
        $pem = Get-ChildItem -LiteralPath $dir -Filter *.pem -File -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($pem) { return @('-i', $pem.FullName) }
    }
    return @()
}
$sshIdent = Get-DeploySshIdentityArg
if ($sshIdent.Count -gt 0) {
    Write-Host "SSH identity: $($sshIdent[1])" -ForegroundColor DarkGray
}

$sshTarget = ($env:DEPLOY_PM2_SSH -replace "[\r\n]+", "").Trim()
$remoteDir = ($env:DEPLOY_REMOTE_DIR -replace "[\r\n]+", "").Trim()
if ([string]::IsNullOrWhiteSpace($sshTarget)) {
    Write-Host "DEPLOY_PM2_SSH not set in .env - cannot deploy to AWS." -ForegroundColor Red
    Write-Host "Add: DEPLOY_PM2_SSH=ubuntu@your-ec2-ip" -ForegroundColor Yellow
    exit 1
}
if ([string]::IsNullOrWhiteSpace($remoteDir)) { $remoteDir = "/var/www/gc-app" }

# Step 1: GitHub push (skip if not a git repo or no changes)
Write-Host "`n=== Step 1: GitHub ===" -ForegroundColor Cyan
if (Test-Path ".git") {
    $status = git status --porcelain
    if ($status) {
        git add .
        git commit -m $Message
        git push origin HEAD:main
        Write-Host "GitHub push done" -ForegroundColor Green
    } else {
        Write-Host "No changes, skip GitHub" -ForegroundColor Yellow
    }
} else {
    Write-Host "Not a git repo, skip GitHub." -ForegroundColor Yellow
}

# Step 2: Server TypeScript build (local sanity check)
Write-Host "`n=== Step 2: Server build (tsc) ===" -ForegroundColor Cyan
Push-Location (Join-Path $projectRoot "server")
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Server build failed - fix before continuing." -ForegroundColor Red
        exit 1
    }
    Write-Host "Server build OK." -ForegroundColor Green
} finally {
    Pop-Location
}

# Step 3: Frontend build + upload to AWS EC2
Write-Host "`n=== Step 3: Frontend build + upload to AWS ===" -ForegroundColor Cyan
if ($env:VITE_API_BASE -and $env:VITE_API_BASE.Trim() -ne "") {
    Write-Host "VITE_API_BASE=$($env:VITE_API_BASE.TrimEnd('/')) (split-origin API; upload/img URLs use this host)" -ForegroundColor DarkGray
} else {
    Write-Host "VITE_API_BASE=(empty: same-origin /api; set in .env when static and API differ)" -ForegroundColor DarkGray
}
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed" -ForegroundColor Red; exit 1 }

# 切勿先 rm -rf dist/assets：上传过程中会出现「新 index 引用新哈希、磁盘上尚无对应 chunk」→ 全站 JS/CSS 404 白屏。
# 策略：保留旧 chunk 直至新文件就位；先传 assets，最后传 index.html，缩短错配窗口。
# dist 路径：用进程 CWD（npm 子进程结束后仍可靠）；勿用 (Get-Location).Path，在个别宿主下可能为 $null
$cwd = [System.IO.Directory]::GetCurrentDirectory()
$distPath = [System.IO.Path]::Combine($cwd, "dist")
Write-Host "Ensuring remote dist exists + uploading frontend (assets first, index.html last) ..." -ForegroundColor DarkGray
Write-Host "  local dist: $distPath" -ForegroundColor DarkGray
& ssh @sshIdent -o BatchMode=yes -o ConnectTimeout=15 $sshTarget "mkdir -p ${remoteDir}/dist"
if ($LASTEXITCODE -ne 0) {
    Write-Host "SSH mkdir failed." -ForegroundColor Red
    exit 1
}

if (Test-Path (Join-Path $distPath "assets")) {
    Write-Host "  [1/3] dist/assets -> remote ..." -ForegroundColor DarkGray
    & scp @sshIdent -o BatchMode=yes -o ConnectTimeout=120 -r (Join-Path $distPath "assets") "${sshTarget}:${remoteDir}/dist/"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "SCP dist/assets failed (exit $LASTEXITCODE)." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "  dist/assets missing — build output invalid." -ForegroundColor Red
    exit 1
}

Write-Host "  [2/3] dist root files (except index.html) ..." -ForegroundColor DarkGray
Get-ChildItem -LiteralPath $distPath -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -cne "index.html" } |
    Sort-Object Name |
    ForEach-Object {
        & scp @sshIdent -o BatchMode=yes -o ConnectTimeout=90 $_.FullName "${sshTarget}:${remoteDir}/dist/"
        if ($LASTEXITCODE -ne 0) {
            Write-Host "SCP failed: $($_.Name) (exit $LASTEXITCODE)." -ForegroundColor Red
            exit 1
        }
    }

$indexLocal = Join-Path $distPath "index.html"
if (-not (Test-Path -LiteralPath $indexLocal)) {
    Write-Host "dist/index.html missing." -ForegroundColor Red
    exit 1
}
Write-Host "  [3/3] index.html ..." -ForegroundColor DarkGray
& scp @sshIdent -o BatchMode=yes -o ConnectTimeout=60 $indexLocal "${sshTarget}:${remoteDir}/dist/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "SCP index.html failed (exit $LASTEXITCODE)." -ForegroundColor Red
    exit 1
}

Write-Host "Frontend upload OK." -ForegroundColor Green
& ssh @sshIdent -o BatchMode=yes -o ConnectTimeout=10 $sshTarget "chmod -R o+rX $remoteDir/dist/" 2>$null

# Step 4: Upload server build + PM2 restart
Write-Host "`n=== Step 4: Upload server + PM2 restart ===" -ForegroundColor Cyan
Write-Host "SSH: $sshTarget  |  dir: $remoteDir" -ForegroundColor DarkGray

Write-Host "Uploading server/dist/ ..." -ForegroundColor DarkGray
& scp @sshIdent -o BatchMode=yes -o ConnectTimeout=15 -r server/dist/* "${sshTarget}:${remoteDir}/server/dist/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Server dist upload failed." -ForegroundColor Red
    exit 1
}

Write-Host "Uploading server/package.json + package-lock.json ..." -ForegroundColor DarkGray
& scp @sshIdent -o BatchMode=yes -o ConnectTimeout=15 server/package.json server/package-lock.json "${sshTarget}:${remoteDir}/server/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Server package.json upload failed." -ForegroundColor Red
    exit 1
}

# 先停 API 再跑 migrate；脚本经 stdin 交给 bash -s，避免 Windows ssh.exe 对单行 `&& …` 传参拆坏（远程 bash: unexpected EOF）
# 全程用 ROOT/ROOT/server 绝对路径，避免相对 cd server 因 cwd 异常失败
$rdBash = $remoteDir.TrimEnd('/').Replace('\', '\\').Replace('"', '\"').Replace('$', '\$').Replace('`', '\`')
$remoteBash = @"
set -e
ROOT="$rdBash"
cd "`$ROOT"
pm2 stop gc-api 2>/dev/null || true
cd "`$ROOT/server"
npm install --production </dev/null
"@
# @"…"@ 的结束行换行不算进字符串，否则下一行会与 `</dev/null` 粘成 `/dev/nullnpm`
$remoteBash += "`n"
if (-not $SkipMigrate) {
    $remoteBash += "npm run migrate:all </dev/null`n"
}
# 以下行为 bash 字面量（含 `$ROOT`），勿用 @"…"@ 以免 PowerShell 解析 `$(`
$remoteBash += @'

cd "$ROOT"
cd "$(dirname "$ROOT")"
test -f ecosystem.config.cjs && pm2 restart ecosystem.config.cjs --update-env || pm2 restart gc-api --update-env
'@

# 远程为 Linux bash：去掉所有 CR；脚本写入 UTF-8 无 BOM 临时文件 + Start-Process 喂给 ssh stdin，避免管道编码/CRLF
$remoteBash = $remoteBash.Replace("`r`n", "`n").Replace("`r", "").TrimEnd() + "`n"
$encUtf8 = New-Object System.Text.UTF8Encoding $false
$tmpSh = Join-Path $env:TEMP ("gc-remote-{0}.sh" -f [Guid]::NewGuid().ToString("N"))
$tmpOut = Join-Path $env:TEMP ("gc-ssh-out-{0}.txt" -f [Guid]::NewGuid().ToString("N"))
$tmpErr = Join-Path $env:TEMP ("gc-ssh-err-{0}.txt" -f [Guid]::NewGuid().ToString("N"))
try {
    [System.IO.File]::WriteAllBytes($tmpSh, $encUtf8.GetBytes($remoteBash))
    $sshArgs = [System.Collections.ArrayList]@()
    foreach ($t in $sshIdent) { [void]$sshArgs.Add($t) }
    [void]$sshArgs.AddRange(@("-o", "BatchMode=yes", "-o", "ConnectTimeout=600", $sshTarget, "bash", "-s", "--"))
    # 必须重定向 stdout/stderr 到文件并读出，否则缓冲区满会死锁
    $remoteProc = Start-Process -FilePath "ssh" -ArgumentList $sshArgs.ToArray() -RedirectStandardInput $tmpSh -RedirectStandardOutput $tmpOut -RedirectStandardError $tmpErr -Wait -NoNewWindow -PassThru
    if (Test-Path -LiteralPath $tmpOut) {
        $o = Get-Content -LiteralPath $tmpOut -Raw -ErrorAction SilentlyContinue
        if ($o) { Write-Host $o }
    }
    if (Test-Path -LiteralPath $tmpErr) {
        $e = Get-Content -LiteralPath $tmpErr -Raw -ErrorAction SilentlyContinue
        if ($e) { Write-Host $e -ForegroundColor DarkGray }
    }
    if ($remoteProc.ExitCode -ne 0) {
        Write-Host "Remote PM2 restart failed (exit $($remoteProc.ExitCode)). Check SSH key, path, and pm2 on server." -ForegroundColor Red
        exit 1
    }
} finally {
    Remove-Item -LiteralPath $tmpSh -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $tmpOut -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $tmpErr -Force -ErrorAction SilentlyContinue
}
Write-Host "Server update + PM2 restart OK." -ForegroundColor Green

Write-Host "`n=== Done ===" -ForegroundColor Green
Write-Host "Frontend: https://crm.fastgc.cc" -ForegroundColor Green
