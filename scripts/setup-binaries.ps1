param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$root = Split-Path -Parent $PSScriptRoot
$bin = Join-Path $root "bin"
New-Item -ItemType Directory -Force -Path $bin | Out-Null

$ytdlp = Join-Path $bin "yt-dlp.exe"
$ffmpeg = Join-Path $bin "ffmpeg.exe"
$qjs = Join-Path $bin "qjs.exe"

if ($Force -or -not (Test-Path $ytdlp)) {
    Write-Host "Downloading yt-dlp..." -ForegroundColor Cyan
    Invoke-WebRequest `
        -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" `
        -OutFile $ytdlp
}

if ($Force -or -not (Test-Path $qjs)) {
    Write-Host "Downloading QuickJS..." -ForegroundColor Cyan
    Invoke-WebRequest `
        -Uri "https://github.com/quickjs-ng/quickjs/releases/download/v0.17.0/qjs-windows-x86_64.exe" `
        -OutFile $qjs
}

if ($Force -or -not (Test-Path $ffmpeg)) {
    $zip = Join-Path $env:TEMP "clipshed-ffmpeg.zip"
    $extract = Join-Path $env:TEMP "clipshed-ffmpeg"
    $url = "https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip"

    Write-Host "Downloading ffmpeg (this can take a minute)..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $url -OutFile $zip

    Remove-Item -Recurse -Force $extract -ErrorAction SilentlyContinue
    Expand-Archive -Path $zip -DestinationPath $extract -Force

    $ffmpegSrc = Get-ChildItem -Path $extract -Recurse -Filter "ffmpeg.exe" |
        Select-Object -First 1

    if (-not $ffmpegSrc) {
        throw "ffmpeg was not found in the downloaded archive."
    }

    Copy-Item $ffmpegSrc.FullName $ffmpeg -Force

    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Binaries ready:" -ForegroundColor Green
Write-Host ("  yt-dlp  " + (& $ytdlp --version))
Write-Host ("  ffmpeg  " + ((& $ffmpeg -version | Select-Object -First 1)))
Write-Host ("  quickjs " + ((& $qjs --help | Select-Object -First 1)))
Write-Host ""
Write-Host "QuickJS is used for yt-dlp when present; Node remains the fallback."
