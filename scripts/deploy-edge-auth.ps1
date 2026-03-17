# 部署登录备用 Edge Functions（解决生产环境无后端时登录失败）
# 用法: 先运行 supabase login，然后执行此脚本
# 部署后需设置 JWT_SECRET: supabase secrets set JWT_SECRET=你的密钥

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host "部署 employee-login 和 employee-me Edge Functions..." -ForegroundColor Cyan
npx supabase functions deploy employee-login --no-verify-jwt
if ($LASTEXITCODE -ne 0) {
    Write-Host "请先运行: supabase login" -ForegroundColor Yellow
    exit 1
}
npx supabase functions deploy employee-me --no-verify-jwt
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host ""
Write-Host "部署完成。若后端使用自定义 JWT_SECRET，请执行:" -ForegroundColor Green
Write-Host "  supabase secrets set JWT_SECRET=你的密钥" -ForegroundColor Gray
Write-Host ""
