# 带后端配置的完整部署
# 用法: 先在 .env 中设置 VITE_API_BASE=https://你的后端地址，然后运行此脚本
# 若未部署后端，请先按 docs/DEPLOY_BACKEND.md 部署到 Render

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

# 加载 .env
if (Test-Path ".env") {
    Get-Content ".env" -Encoding UTF8 | ForEach-Object {
        if ($_ -match '^VITE_API_BASE=(.+)$') {
            $env:VITE_API_BASE = $matches[1].Trim().Trim('"')
        }
    }
}

if (-not $env:VITE_API_BASE) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  未配置 VITE_API_BASE，登录将失败！" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "请按以下步骤操作：" -ForegroundColor Yellow
    Write-Host "1. 打开 https://render.com 注册并部署后端（详见 docs/DEPLOY_BACKEND.md）"
    Write-Host "2. 在 .env 中添加：VITE_API_BASE=https://你的服务名.onrender.com"
    Write-Host "3. 重新运行：npm run deploy:full"
    Write-Host ""
    exit 1
}

Write-Host "VITE_API_BASE=$env:VITE_API_BASE" -ForegroundColor Green
Write-Host "执行完整部署..." -ForegroundColor Cyan
& "$PSScriptRoot\deploy-full.ps1" @args
