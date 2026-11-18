param(
    [ValidateSet("aarch64", "x86_64")]
    [string]$Target = "aarch64",

    [switch]$Release
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

foreach ($name in @("JAVA_HOME", "ANDROID_HOME", "NDK_HOME")) {
    if (-not (Get-Item "Env:$name" -ErrorAction SilentlyContinue)) {
        throw "$name is not set. Run the Tauri Android toolchain setup first."
    }
}

$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"

$targetTriple = if ($Target -eq "aarch64") { "aarch64-linux-android" } else { "x86_64-linux-android" }
$abi = if ($Target -eq "aarch64") { "arm64-v8a" } else { "x86_64" }
$variant = if ($Release) { "release" } else { "debug" }
$gradleTask = if ($Target -eq "aarch64") {
    if ($Release) { "assembleArm64Release" } else { "assembleArm64Debug" }
} else {
    if ($Release) { "assembleX86_64Release" } else { "assembleX86_64Debug" }
}
$apkDir = if ($Target -eq "aarch64") { "arm64" } else { "x86_64" }

# Tauri links the Rust .so into jniLibs. Windows refuses non-elevated symlinks
# unless Developer Mode is enabled, so this script builds the Rust library,
# copies it, and invokes Gradle with the Rust tasks skipped.
if ($Release -and $Target -eq "aarch64") {
    $env:RUSTFLAGS = "-C link-arg=-Wl,-z,max-page-size=16384 -C link-arg=-Wl,-z,common-page-size=16384"
}

$tauriArgs = @("android", "build", "--apk", "--target", $Target, "--ci")
if (-not $Release) { $tauriArgs += "--debug" }
& (Join-Path $root "node_modules\.bin\tauri.cmd") @tauriArgs
$tauriExit = $LASTEXITCODE

$so = Join-Path $root "src-tauri\target\$targetTriple\$variant\libapp_lib.so"
if (-not (Test-Path $so)) {
    throw "The Rust library was not built (Tauri exit $tauriExit). Fix the Tauri build first."
}

$jni = Join-Path $root "src-tauri\gen\android\app\src\main\jniLibs\$abi"
New-Item -ItemType Directory -Force $jni | Out-Null
Copy-Item $so (Join-Path $jni "libapp_lib.so") -Force

$skip = @(
    "-x", "rustBuildArm64Debug", "-x", "rustBuildArmDebug",
    "-x", "rustBuildX86Debug", "-x", "rustBuildX86_64Debug",
    "-x", "rustBuildArm64Release", "-x", "rustBuildArmRelease",
    "-x", "rustBuildX86Release", "-x", "rustBuildX86_64Release"
)

Push-Location (Join-Path $root "src-tauri\gen\android")
try {
    & ".\gradlew.bat" ":app:$gradleTask" @skip --console=plain
    if ($LASTEXITCODE -ne 0) { throw "Gradle failed with exit code $LASTEXITCODE." }
} finally {
    Pop-Location
}

$apk = Join-Path $root "src-tauri\gen\android\app\build\outputs\apk\$apkDir\$variant\app-$apkDir-$variant.apk"
if (-not (Test-Path $apk)) { throw "APK was not produced at $apk" }

$sizeMb = [math]::Round((Get-Item $apk).Length / 1MB, 1)
Write-Host ""
Write-Host "APK ready: $apk ($sizeMb MB)" -ForegroundColor Green
