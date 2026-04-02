# Write Supabase service_role key to server/.env
# Usage: 1. Copy service_role key from Supabase  2. Run this script

$key = try { (Get-Clipboard -ErrorAction SilentlyContinue).ToString().Trim() } catch { "" }
if ([string]::IsNullOrWhiteSpace($key)) {
    $key = (Read-Host "Paste service_role key").Trim()
}
if ([string]::IsNullOrWhiteSpace($key)) {
    Write-Host "No key, cancelled" -ForegroundColor Yellow
    exit 1
}
if (-not $key.StartsWith("eyJ")) {
    Write-Host "Invalid: key should start with eyJ (JWT format). Make sure you copied service_role from Supabase." -ForegroundColor Red
    exit 1
}

$envPath = Join-Path $PSScriptRoot "..\server\.env"
$content = Get-Content $envPath -Raw -Encoding UTF8
$newLine = "SUPABASE_SERVICE_ROLE_KEY=" + $key
$content = $content -replace 'SUPABASE_SERVICE_ROLE_KEY=.*', $newLine
Set-Content $envPath $content -NoNewline -Encoding UTF8
Write-Host "Updated server/.env. Restart backend: cd server; npm run dev" -ForegroundColor Green
