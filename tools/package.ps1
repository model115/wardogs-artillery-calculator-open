

param(
    [string]$Version = "v1.0.0",
    [string]$Runtime = "win-x64"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "== 1/5 资产自检 ==" -ForegroundColor Cyan
dotnet run --project tools/WardogsArtillery.Tools -c Release -- assets check
if ($LASTEXITCODE -ne 0) { throw "资产自检未通过：先跑 assets all" }

Write-Host "== 2/5 跑测试 ==" -ForegroundColor Cyan
dotnet test -c Release --nologo -v q
if ($LASTEXITCODE -ne 0) { throw "测试未通过" }

Write-Host "== 3/5 前端自检 ==" -ForegroundColor Cyan
node tools/webcheck.mjs
if ($LASTEXITCODE -ne 0) { throw "webcheck 未通过" }
node tools/webrender-check.mjs
if ($LASTEXITCODE -ne 0) { throw "webrender 未通过" }

node tools/corecheck.mjs
if ($LASTEXITCODE -ne 0) { throw "corecheck 未通过：先跑 tools ... core-golden 并检查 web/core/*.js" }
node tools/e2echeck.mjs
if ($LASTEXITCODE -ne 0) { throw "e2echeck 未通过（静态站数据流有问题）" }

Write-Host "== 4/5 发布单文件 exe ==" -ForegroundColor Cyan
$stage = Join-Path $root "dist\stage"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
dotnet publish src/WardogsArtillery.Server -c Release -r $Runtime -o $stage
if ($LASTEXITCODE -ne 0) { throw "发布失败" }

Write-Host "== 5/5 组装发行包 ==" -ForegroundColor Cyan
Copy-Item (Join-Path $root "data") (Join-Path $stage "data") -Recurse -Force
Copy-Item (Join-Path $root "packaging\启动.cmd") $stage -Force
Copy-Item (Join-Path $root "README.md") $stage -Force
Copy-Item (Join-Path $root "LICENSE") $stage -Force
Copy-Item (Join-Path $root "THIRD-PARTY-NOTICES.md") $stage -Force
Remove-Item (Join-Path $stage "*.pdb") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $stage "web.config") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $stage "*.staticwebassets.endpoints.json") -Force -ErrorAction SilentlyContinue

foreach ($cmd in Get-ChildItem $stage -Filter *.cmd -File) {
    $bytes = [System.IO.File]::ReadAllBytes($cmd.FullName)
    $cr = ($bytes | Where-Object { $_ -eq 13 }).Count
    $lf = ($bytes | Where-Object { $_ -eq 10 }).Count
    $nonAscii = ($bytes | Where-Object { $_ -gt 127 }).Count
    if ($cr -ne $lf) { throw "$($cmd.Name) 行尾不是纯 CRLF（CR=$cr LF=$lf），cmd.exe 会解析错乱" }
    if ($nonAscii -gt 0) { throw "$($cmd.Name) 含 $nonAscii 个非 ASCII 字节，cmd.exe 处理多字节批处理不可靠，请改成纯 ASCII" }
    Write-Host ("  [OK] {0}  CRLF + ASCII（{1} B）" -f $cmd.Name, $bytes.Length)
}

$zip = Join-Path $root "dist\WardogsArtillery-$Version-$Runtime.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -CompressionLevel Optimal

$exeSize = (Get-Item (Join-Path $stage "WardogsArtillery.exe")).Length / 1MB
$zipSize = (Get-Item $zip).Length / 1MB
$dataSize = (Get-ChildItem (Join-Path $stage "data") -Recurse -File | Measure-Object Length -Sum).Sum / 1MB

Write-Host ""
Write-Host "完成：" -ForegroundColor Green
Write-Host ("  exe      {0:N2} MB" -f $exeSize)
Write-Host ("  data     {0:N2} MB" -f $dataSize)
Write-Host ("  zip      {0:N2} MB  → {1}" -f $zipSize, $zip)
