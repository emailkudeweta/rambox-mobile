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

# 1. Pastikan semua file lokal sudah ter-commit
$status = & git status --porcelain
if ($status) {
    Write-Host "[1/4] Menemukan perubahan kode lokal, membuat commit otomatis..." -ForegroundColor Yellow
    & git add .
    & git commit -m "update: automated sync $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
} else {
    Write-Host "[1/4] Seluruh perubahan kode lokal sudah ter-commit rapi." -ForegroundColor Green
}

# 2. Tag versi rilis jika diminta
if ($Tag) {
    Write-Host "[2/4] Menambahkan release tag: $Tag..." -ForegroundColor Yellow
    & git tag -f $Tag -m "Release $Tag"
} else {
    Write-Host "[2/4] Melewati pembuatan tag baru (menggunakan commit branch main)." -ForegroundColor Gray
}

# 3. Push ke GitHub
Write-Host "[3/4] Mengunggah (push) ke GitHub repository (emailkudeweta/rambox-mobile)..." -ForegroundColor Yellow

# Periksa apakah ada token di environment variable GITHUB_TOKEN
if ($env:GITHUB_TOKEN) {
    Write-Host "Menggunakan GITHUB_TOKEN dari environment variable..." -ForegroundColor Green
    $pushUrl = "https://emailkudeweta:$($env:GITHUB_TOKEN)@github.com/emailkudeweta/rambox-mobile.git"
    & git push $pushUrl main --force
    if ($Tag) {
        & git push $pushUrl $Tag --force
    }
} else {
    # Jalankan git push biasa (jika sudah login di browser / Git Credential Manager)
    try {
        & git push origin main
        if ($Tag) {
            & git push origin $Tag
        }
    } catch {
        Write-Host ""
        Write-Host "⚠️ Autentikasi GitHub diperlukan untuk melakukan push otomatis." -ForegroundColor Yellow
        Write-Host "Silakan masukkan GitHub Personal Access Token (PAT) Anda:" -ForegroundColor Cyan
        Write-Host "(Dapat dibuat di: https://github.com/settings/tokens dengan centang 'repo')" -ForegroundColor Gray
        $tokenInput = Read-Host -Prompt "GitHub Token (ghp_...)"
        if ($tokenInput) {
            $pushUrl = "https://emailkudeweta:$($tokenInput.Trim())@github.com/emailkudeweta/rambox-mobile.git"
            & git push $pushUrl main --force
            if ($Tag) {
                & git push $pushUrl $Tag --force
            }
            # Simpan token ke environment sementara jika sukses
            $env:GITHUB_TOKEN = $tokenInput.Trim()
            Write-Host "✅ Berhasil tersambung dan diunggah ke GitHub!" -ForegroundColor Green
        }
    }
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "🎉 KODE BERHASIL DIUNGGAH KE GITHUB!" -ForegroundColor Green
Write-Host "GitHub Pages & GitHub Actions sedang memproses update secara otomatis." -ForegroundColor Green
Write-Host "Aplikasi di ponsel Anda akan segera menerima pembaruan OTA." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
