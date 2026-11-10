# Đóng gói game thành NhaHang3D-deploy.zip để upload lên MonsterASP.NET
# Chạy:  powershell -ExecutionPolicy Bypass -File deploy.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path web.config)) {
  Write-Host 'Chua co web.config! Copy web.config.example thanh web.config va dien thong tin database.' -ForegroundColor Red
  exit 1
}

$out = Join-Path $PSScriptRoot 'deploy'
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory $out | Out-Null

# File cần thiết để chạy
Copy-Item index.html, serve.js, package.json, package-lock.json, web.config -Destination $out
Copy-Item js, db -Destination $out -Recurse

# Cài thư viện bản production (bỏ driver Windows auth — trên host dùng đăng nhập SQL)
Push-Location $out
npm install --omit=dev --omit=optional --no-audit --no-fund | Out-Host
Pop-Location
New-Item -ItemType Directory (Join-Path $out 'logs') | Out-Null

$zip = Join-Path $PSScriptRoot 'NhaHang3D-deploy.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $out '*') -DestinationPath $zip
Write-Host "Xong: $zip ($([math]::Round((Get-Item $zip).Length / 1MB, 1)) MB)" -ForegroundColor Green
