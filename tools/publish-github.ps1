

param(
    [string]$Owner = "model115",
    [string]$Repo = "wardogs-artillery-calculator",
    [switch]$Private,
    [string]$Version = "v1.0.0"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$gh = "C:\Program Files\GitHub CLI\gh.exe"
if (-not (Test-Path $gh)) {
    $cmd = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $cmd) { throw "找不到 gh，请先安装：winget install --id GitHub.cli" }
    $gh = $cmd.Source
}

Write-Host "== 1/4 检查登录状态 ==" -ForegroundColor Cyan
& $gh auth status
if ($LASTEXITCODE -ne 0) { throw "未登录 GitHub，请先执行：gh auth login" }

Write-Host "== 2/4 检查工作区干净 ==" -ForegroundColor Cyan
$dirty = git status --porcelain
if ($dirty) {
    Write-Host $dirty
    throw "有未提交改动，请先 git add -A && git commit"
}
git log --oneline -1

Write-Host "== 3/4 创建仓库并推送 ==" -ForegroundColor Cyan
$visibility = if ($Private) { "--private" } else { "--public" }
& $gh repo create "$Owner/$Repo" $visibility --source . --remote origin --push `
    --description "WARDOGS 火炮解算器 / Artillery Calculator — 地图 + 3D 高程 + 射表 → 游戏内方位角与刻度"
if ($LASTEXITCODE -ne 0) { throw "仓库创建或推送失败" }

Write-Host "== 4/4 打 tag 并创建 Release（附带发行包）==" -ForegroundColor Cyan
$zip = Join-Path $root "dist\WardogsArtillery-$Version-win-x64.zip"
if (Test-Path $zip) {
    git tag $Version 2>$null
    git push origin $Version
    & $gh release create $Version $zip `
        --title "WARDOGS 火炮解算器 $Version" `
        --notes-file CHANGELOG.md
} else {
    Write-Host "  未找到 $zip，跳过 Release（先跑 tools/package.ps1）" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "完成 → https://github.com/$Owner/$Repo" -ForegroundColor Green
