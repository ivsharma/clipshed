param(
    [switch]$Dev
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Cyan
    npm install
}

if (-not (Test-Path "bin/yt-dlp.exe") -or -not (Test-Path "bin/ffmpeg.exe")) {
    Write-Host "Setting up yt-dlp and ffmpeg..." -ForegroundColor Cyan
    & (Join-Path $root "scripts/setup-binaries.ps1")
}

if ($Dev) {
    Start-Job -ScriptBlock {
        Start-Sleep -Seconds 3
        Start-Process "http://127.0.0.1:5173"
    } | Out-Null
    Write-Host "Starting development servers at http://127.0.0.1:5173" -ForegroundColor Green
    npm run dev
} else {
    if (-not (Test-Path "web/dist/index.html")) {
        Write-Host "Building the frontend..." -ForegroundColor Cyan
        npm run build
    }

    Start-Job -ScriptBlock {
        Start-Sleep -Seconds 2
        Start-Process "http://127.0.0.1:3000"
    } | Out-Null
    Write-Host "Starting Clipshed at http://127.0.0.1:3000" -ForegroundColor Green
    npm start
}
