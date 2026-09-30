# ==============================================================================
# Rambox Mobile - GitHub Automated Sync & OTA Release Trigger
# ==============================================================================
param (
    [string]$Tag = ""
)

$ErrorActionPreference = "Stop"
$repoPath = "D:\rambox_apk"
Set-Location $repoPath

$env:PATH = "C:\Program Files\Git\cmd;C:\Program Files\Git\bin;C:\Program Files\Git\mingw64\bin;$env:PATH"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   🚀 Rambox Mobile - Auto Sync & OTA Deployment" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Baca versi saat ini dari package.json
$pkgJsonPath = Join-Path $repoPath "package.json"
$pkg = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
$currentVer = $pkg.version

# Tentukan Tag rilis
if (-not $Tag) {
    # Cek apakah tag sudah ada di Git lokal atau remote
    $existingTags = (& git tag)
    $candidateTag = "v$currentVer"

    if ($existingTags -contains $candidateTag) {
        # Tag sudah pernah dibuat, otomatis naikkan patch version (misal 1.0.2 -> 1.0.3)
        $parts = $currentVer.Split('.')
        $major = [int]$parts[0]
        $minor = [int]$parts[1]
        $patch = [int]$parts[2] + 1
        $newVer = "$major.$minor.$patch"
        $Tag = "v$newVer"

        Write-Host "Tag $candidateTag sudah ada. Otomatis menaikkan versi rilis ke $Tag..." -ForegroundColor Yellow

        # Update package.json
        $pkg.version = $newVer
        $pkg | ConvertTo-Json -Depth 4 | Set-Content $pkgJsonPath -Encoding UTF8

        # Update AutoUpdaterModal.jsx
        $updaterPath = Join-Path $repoPath "src\components\AutoUpdaterModal.jsx"
        $content = Get-Content $updaterPath -Raw
        $content = $content -replace "CURRENT_APP_VERSION = '[^']+'", "CURRENT_APP_VERSION = '$newVer'"
        Set-Content -Path $updaterPath -Value $content -Encoding UTF8

        # Update build.gradle
        $gradlePath = Join-Path $repoPath "android\app\build.gradle"
        $gradleContent = Get-Content $gradlePath -Raw
        $gradleContent = $gradleContent -replace 'versionCode \d+', "versionCode $(100 + $patch)"
        $gradleContent = $gradleContent -replace 'versionName "[^"]+"', "versionName `"$newVer`""
        Set-Content -Path $gradlePath -Value $gradleContent -Encoding UTF8
    } else {
        $Tag = $candidateTag
    }
}

Write-Host "[1/4] Versi rilis OTA yang akan dipublikasikan: $Tag" -ForegroundColor Cyan

# 2. Pastikan semua file lokal ter-commit
$status = & git status --porcelain
if ($status) {
    Write-Host "[2/4] Menyimpan perubahan kode lokal ke git..." -ForegroundColor Yellow
    & git add .
    & git commit -m "release: $Tag - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
} else {
    Write-Host "[2/4] Seluruh perubahan kode lokal sudah tersimpan rapi." -ForegroundColor Green
}

# 3. Buat Git Tag
Write-Host "[3/4] Menetapkan release tag $Tag..." -ForegroundColor Yellow
& git tag -f $Tag -m "Release $Tag"

# 4. Push ke GitHub
Write-Host "[4/4] Mengunggah (push) branch main & tag $Tag ke GitHub..." -ForegroundColor Yellow

if ($env:GITHUB_TOKEN) {
    $pushUrl = "https://emailkudeweta:$($env:GITHUB_TOKEN)@github.com/emailkudeweta/rambox-mobile.git"
    & git push $pushUrl main --force
    & git push $pushUrl $Tag --force
} else {
    try {
        & git push origin main
        & git push origin $Tag --force
    } catch {
        Write-Host ""
        Write-Host "⚠️ Autentikasi GitHub diperlukan untuk melakukan push otomatis." -ForegroundColor Yellow
        Write-Host "Silakan masukkan GitHub Personal Access Token (PAT) Anda:" -ForegroundColor Cyan
        Write-Host "(Dapat dibuat di: https://github.com/settings/tokens dengan centang 'repo')" -ForegroundColor Gray
        $tokenInput = Read-Host -Prompt "GitHub Token (ghp_...)"
        if ($tokenInput) {
            $pushUrl = "https://emailkudeweta:$($tokenInput.Trim())@github.com/emailkudeweta/rambox-mobile.git"
            & git push $pushUrl main --force
            & git push $pushUrl $Tag --force
            $env:GITHUB_TOKEN = $tokenInput.Trim()
            Write-Host "✅ Berhasil tersambung dan diunggah ke GitHub!" -ForegroundColor Green
        }
    }
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "🎉 RILIS $Tag BERHASIL DIUNGGAH KE GITHUB!" -ForegroundColor Green
Write-Host "GitHub Actions sedang mem-build APK $Tag di cloud." -ForegroundColor Green
Write-Host "Aplikasi di ponsel Anda akan segera menerima notifikasi OTA." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
