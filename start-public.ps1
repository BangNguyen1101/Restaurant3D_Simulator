# Chạy game trên máy này và mở link công khai qua Cloudflare Tunnel.
# Chạy:  powershell -ExecutionPolicy Bypass -File start-public.ps1
# Dừng:  bấm Ctrl+C (tắt cả tunnel lẫn server game)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host 'Chua cai cloudflared. Hay chay lenh sau roi mo lai PowerShell:' -ForegroundColor Red
  Write-Host '  winget install --id Cloudflare.cloudflared' -ForegroundColor Yellow
  exit 1
}
if (-not (Test-Path node_modules)) { npm install }

# 1) Bật server game (cửa sổ thu nhỏ)
$server = Start-Process node -ArgumentList 'serve.js' -PassThru -WindowStyle Minimized
Start-Sleep -Seconds 4
try {
  Invoke-WebRequest http://localhost:5173/api/status -UseBasicParsing | Out-Null
  Write-Host 'Server game da chay: http://localhost:5173' -ForegroundColor Green
} catch {
  Write-Host 'Server game khong khoi dong duoc!' -ForegroundColor Red
  Stop-Process $server -Force -ErrorAction SilentlyContinue
  exit 1
}

# 2) Mở tunnel. Tìm dòng có  https://....trycloudflare.com  trong log bên dưới — đó là link gửi cho mọi người.
Write-Host ''
Write-Host 'Dang mo Cloudflare Tunnel... tim dong https://xxxx.trycloudflare.com ben duoi' -ForegroundColor Cyan
try {
  cloudflared tunnel --url http://localhost:5173
} finally {
  Stop-Process $server -Force -ErrorAction SilentlyContinue
  Write-Host 'Da tat server game.' -ForegroundColor Yellow
}
