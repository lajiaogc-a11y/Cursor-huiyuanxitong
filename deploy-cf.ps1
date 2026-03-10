# Cloudflare Pages 部署脚本
# 使用前请设置环境变量 CLOUDFLARE_API_TOKEN（在 Cloudflare 控制台创建 API Token，而非 Global API Key）

param(
    [string]$Token = $env:CLOUDFLARE_API_TOKEN,
    [string]$AccountId = "a6fa9e34e1c8653d73bb0d5d6dfbb785",
    [string]$ProjectName = "gift-system"
)

if (-not $Token) {
    Write-Host "错误: 请设置 CLOUDFLARE_API_TOKEN 环境变量" -ForegroundColor Red
    Write-Host ""
    Write-Host "获取 API Token 步骤:" -ForegroundColor Yellow
    Write-Host "1. 登录 https://dash.cloudflare.com"
    Write-Host "2. 右上角头像 -> My Profile -> API Tokens"
    Write-Host "3. Create Token -> 选择 'Edit Cloudflare Workers' 模板"
    Write-Host "4. 权限需包含: Account - Cloudflare Pages - Edit"
    Write-Host "5. 复制生成的 Token（只显示一次）"
    Write-Host ""
    Write-Host "PowerShell 示例: `$env:CLOUDFLARE_API_TOKEN='你的Token'; .\deploy-cf.ps1" -ForegroundColor Cyan
    exit 1
}

Write-Host "正在构建项目..." -ForegroundColor Green
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "正在部署到 Cloudflare Pages..." -ForegroundColor Green
$env:CLOUDFLARE_ACCOUNT_ID = $AccountId
npx wrangler pages deploy dist --project-name=$ProjectName
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "部署完成! 访问 https://crm.fastgc.cc 查看" -ForegroundColor Green
