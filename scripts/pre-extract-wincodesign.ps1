# scripts/pre-extract-wincodesign.ps1
#
# 修复 Windows 构建时 winCodeSign 解压失败问题
# 根因：winCodeSign-2.6.0.7z 内含 macOS 符号链接，无管理员/开发者模式时 7za 退出码 2
# 解决：预提取到 electron-builder 期望的缓存目录（winCodeSign-2.6.0），忽略符号链接错误
# 注意：signtool.exe 实际位于 windows-10\x64\ 而不是 windows\

$ErrorActionPreference = "Continue"

$cacheBase   = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
$targetDir   = "$cacheBase\winCodeSign-2.6.0"
$projectRoot = Split-Path -Parent $PSScriptRoot
$sevenZip    = Join-Path $projectRoot "node_modules\7zip-bin\win\x64\7za.exe"
$signtoolRel = "windows-10\x64\signtool.exe"  # 真实路径（不是 windows\signtool.exe）

function log($msg, $col = "Cyan") { Write-Host "[winCodeSign-fix] $msg" -ForegroundColor $col }

# ── 1. 已有可用缓存 ──
if (Test-Path (Join-Path $targetDir $signtoolRel)) {
    log "Cache ready: $targetDir" Green
    exit 0
}

# ── 2. 检查是否有已提取但未重命名的目录可复用 ──
$extracted = Get-ChildItem $cacheBase -Directory -ErrorAction SilentlyContinue |
             Where-Object { $_.Name -match '^\d+$' } |
             Where-Object { Test-Path (Join-Path $_.FullName $signtoolRel) } |
             Select-Object -First 1

if ($extracted) {
    log "Found valid extracted dir: $($extracted.Name) — renaming to winCodeSign-2.6.0" Yellow
    Remove-Item $targetDir -Recurse -Force -ErrorAction SilentlyContinue
    Move-Item $extracted.FullName $targetDir
    log "SUCCESS: $targetDir" Green
    exit 0
}

# ── 3. 验证 7za ──
if (-not (Test-Path $sevenZip)) {
    log "7za not found: $sevenZip — run npm install first" Red; exit 1
}

# ── 4. 找有效 .7z（≥ 5 MB）──
$archive = Get-ChildItem $cacheBase -Filter "*.7z" -ErrorAction SilentlyContinue |
           Where-Object { $_.Length -ge 5MB } |
           Sort-Object LastWriteTime -Descending |
           Select-Object -First 1

if (-not $archive) {
    log "Downloading winCodeSign-2.6.0.7z (~5.4 MB)..." Yellow
    New-Item -ItemType Directory -Force $cacheBase | Out-Null
    $dlPath = "$cacheBase\winCodeSign-2.6.0-fresh.7z"
    Invoke-WebRequest -Uri "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z" `
        -OutFile $dlPath -UseBasicParsing -TimeoutSec 300
    $archive = Get-Item $dlPath
    log "Downloaded: $dlPath" Green
}

log "Archive: $($archive.Name)  ($([math]::Round($archive.Length/1MB,1)) MB)"

# ── 5. 提取（用 Start-Process 绕开 PowerShell stderr 错误处理）──
$tempDir = "$cacheBase\_wcs_$(Get-Random)"
Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $tempDir | Out-Null

log "Extracting..."
$tmpOut = [System.IO.Path]::GetTempFileName()
$tmpErr = [System.IO.Path]::GetTempFileName()
$proc = Start-Process -FilePath $sevenZip `
    -ArgumentList @("x", "-o`"$tempDir`"", "`"$($archive.FullName)`"", "-y") `
    -Wait -NoNewWindow -PassThru `
    -RedirectStandardOutput $tmpOut -RedirectStandardError $tmpErr

$ec      = $proc.ExitCode
$errText = Get-Content $tmpErr -Raw -ErrorAction SilentlyContinue
Remove-Item $tmpOut, $tmpErr -Force -ErrorAction SilentlyContinue
log "7za exit=$ec  (2 = only macOS symlinks failed, Windows tools OK)" $(if ($ec -le 2) {"Gray"} else {"Red"})

# ── 6. 验证关键文件 ──
if (-not (Test-Path (Join-Path $tempDir $signtoolRel))) {
    log "ERROR: signtool.exe not found at $signtoolRel (exit=$ec)" Red
    if ($errText) { log "7za stderr: $errText" Red }
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    exit 1
}
log "signtool.exe OK" Green

# ── 7. 移到正式缓存 ──
Remove-Item $targetDir -Recurse -Force -ErrorAction SilentlyContinue
Move-Item $tempDir $targetDir -ErrorAction Stop
log "SUCCESS: winCodeSign-2.6.0 ready at $targetDir" Green
exit 0
