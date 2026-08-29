#requires -Version 5.1
<#
  prompt-enhance 安装 / 同步脚本（幂等，可重复执行）
  注意：本脚本是本地开发/源码同步工具；面向用户的正式安装请使用：
    dsh plugin --profile web add @lidaxi/prompt-enhance

  用途：
    - 首次安装：创建源码联接、同步安装副本、注册依赖与 bundle
    - 日常开发：改完源码后直接执行，把最新代码同步到安装副本并做语法/一致性校验

  用法：在仓库目录执行
    .\install.ps1
  或指定 DSH 主目录：
    .\install.ps1 -DshHome C:\Users\<你的用户名>\.dsh

  执行完成后请重启 dsh web 并刷新页面。
#>
[CmdletBinding()]
param(
  [string]$DshHome = $env:DSH_HOME
)

$ErrorActionPreference = 'Stop'

# ---------- 0. 定位源码与 DSH 主目录 ----------
$src = $PSScriptRoot
if (-not (Test-Path (Join-Path $src 'lib\index.js'))) {
  throw "未在插件源码目录运行（找不到 $src\lib\index.js），请 cd 到仓库目录后执行。"
}
if (-not $DshHome) { $DshHome = Join-Path $HOME '.dsh' }
$pluginsDir = Join-Path $DshHome 'plugins'
$pluginLink = Join-Path $pluginsDir 'prompt-enhance'
$webDir     = Join-Path $DshHome 'profiles\web'
$installDir = Join-Path $webDir 'node_modules\@lidaxi\prompt-enhance'
$webPkgFile = Join-Path $webDir 'package.json'
$syncFiles  = @('lib\index.js', 'lib\client.js', 'package.json', 'README.md', 'LICENSE', 'cordis.patch.yml')

Write-Host "==> 插件源码: $src" -ForegroundColor Cyan
Write-Host "==> DSH 主目录: $DshHome" -ForegroundColor Cyan

# ---------- 1. 源码联接（plugins\prompt-enhance）----------
$link = Get-Item $pluginLink -ErrorAction SilentlyContinue
if ($link -and $link.LinkType -eq 'Junction' -and $link.Target -eq $src) {
  Write-Host "[1/4] 联接已就绪: plugins\prompt-enhance -> $src" -ForegroundColor Green
} elseif ($link -and $link.LinkType) {
  Write-Warning "[1/4] plugins\prompt-enhance 已是指向别处的联接（$($link.Target)），跳过。"
} elseif ($link) {
  Write-Warning "[1/4] plugins\prompt-enhance 已存在且不是联接（真实目录）。如想改用本仓库，请先删除该目录后重跑。"
} else {
  New-Item -ItemType Directory $pluginsDir -Force | Out-Null
  New-Item -ItemType Junction -Path $pluginLink -Target $src | Out-Null
  Write-Host "[1/4] 已创建联接: plugins\prompt-enhance -> $src" -ForegroundColor Green
}

# ---------- 2. web profile 检查 ----------
if (-not (Test-Path $webDir)) {
  Write-Warning "[2/4] 未检测到 web profile（$webDir）。请先启用 dsh web profile，再重跑本脚本完成注册与同步。"
  return
}

# ---------- 3. 同步安装副本 ----------
$installLink = Get-Item $installDir -ErrorAction SilentlyContinue
if ($installLink -and $installLink.LinkType) {
  Write-Host "[3/4] 安装副本为联接，跳过同步（源码改动已即时生效）" -ForegroundColor Green
} else {
  New-Item -ItemType Directory $installDir -Force | Out-Null
  New-Item -ItemType Directory (Join-Path $installDir 'lib') -Force | Out-Null
  foreach ($f in $syncFiles) {
    $s = Join-Path $src $f
    if (Test-Path $s) {
      $d = Join-Path $installDir $f
      # 先删目标再复制：npm file: 安装可能产生硬链接，直接覆盖会报“无法覆盖自身”
      if (Test-Path $d) { Remove-Item $d -Force }
      Copy-Item $s $d -Force
    }
  }
  $mismatch = @()
  foreach ($f in $syncFiles) {
    $s = Join-Path $src $f
    $d = Join-Path $installDir $f
    if (Test-Path $s) {
      if (-not (Test-Path $d) -or (Get-FileHash $s).Hash -ne (Get-FileHash $d).Hash) { $mismatch += $f }
    }
  }
  if ($mismatch.Count -eq 0) {
    Write-Host "[3/4] 安装副本已同步，6 个文件校验一致" -ForegroundColor Green
  } else {
    throw "安装副本校验不一致: $($mismatch -join ', ')"
  }
}

# 语法校验（改坏代码时在重启前就报错）
foreach ($js in @('lib\index.js', 'lib\client.js')) {
  $out = & node --check (Join-Path $installDir $js) 2>&1
  if ($LASTEXITCODE -ne 0) { throw "语法错误 $js ：$($out | Out-String) —— 请修复后再重启。" }
}
Write-Host "      node --check 通过" -ForegroundColor Green

# ---------- 4. 注册依赖与 bundle ----------
if (-not (Test-Path $webPkgFile)) {
  Write-Warning "[4/4] 未找到 $webPkgFile，跳过注册。"
} else {
  $pkg = Get-Content $webPkgFile -Raw | ConvertFrom-Json
  $changed = $false

  if (-not $pkg.dependencies) {
    $pkg | Add-Member -NotePropertyName dependencies -NotePropertyValue ([pscustomobject]@{}) -Force
  }
  if (-not $pkg.dependencies.'@lidaxi/prompt-enhance') {
    # PSCustomObject 上不能直接给不存在的属性赋值（ConvertFrom-Json 产物），用 Add-Member
    $pkg.dependencies | Add-Member -NotePropertyName '@lidaxi/prompt-enhance' -NotePropertyValue 'file:../../plugins/prompt-enhance' -Force
    $changed = $true
  }

  if (-not $pkg.dsh) { $pkg | Add-Member -NotePropertyName dsh -NotePropertyValue @{} -Force }
  if (-not $pkg.dsh.profile) { $pkg.dsh | Add-Member -NotePropertyName profile -NotePropertyValue @{} -Force }
  if (-not $pkg.dsh.profile.bundles) { $pkg.dsh.profile | Add-Member -NotePropertyName bundles -NotePropertyValue @() -Force }
  if (@($pkg.dsh.profile.bundles) -notcontains '@lidaxi/prompt-enhance') {
    $pkg.dsh.profile.bundles = @($pkg.dsh.profile.bundles) + '@lidaxi/prompt-enhance'
    $changed = $true
  }

  if ($changed) {
    [System.IO.File]::WriteAllText($webPkgFile, ($pkg | ConvertTo-Json -Depth 12), (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "[4/4] 已在 profiles\web\package.json 注册依赖与 bundle" -ForegroundColor Green
  } else {
    Write-Host "[4/4] profiles\web\package.json 已注册，无需修改" -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "安装/同步完成。请重启 dsh web 并刷新页面使改动生效。" -ForegroundColor Yellow
