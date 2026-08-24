#requires -Version 5.1
<#
  prompt-enhance 卸载脚本（安全）

  删除：
    - 安装副本 profiles\web\node_modules\prompt-enhance
    - profiles\web\package.json 中的依赖与 bundle 注册
    - plugins\prompt-enhance 目录联接（只删链接，不删目标）

  保留：
    - 本仓库源码（$PSScriptRoot）不会被删除

  用法：.\uninstall.ps1 [-Force]
  （不带 -Force 会先确认；卸载后请重启 dsh web）
#>
[CmdletBinding()]
param(
  [string]$DshHome = $env:DSH_HOME,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

if (-not $DshHome) { $DshHome = Join-Path $HOME '.dsh' }
$pluginLink = Join-Path $DshHome 'plugins\prompt-enhance'
$installDir = Join-Path $DshHome 'profiles\web\node_modules\prompt-enhance'
$webPkgFile = Join-Path $DshHome 'profiles\web\package.json'

Write-Host "即将从 DSH（$DshHome）卸载 prompt-enhance 插件。" -ForegroundColor Yellow
Write-Host "  源码仓库 $($PSScriptRoot) 不会被删除。" -ForegroundColor Yellow
if (-not $Force) {
  $yn = Read-Host "确认继续？[y/N]"
  if ($yn -notmatch '^[yY]') { Write-Host "已取消。"; exit 0 }
}

# 1) 安装副本（若为联接/链接只删链接本身，绝不递归删目标）
if (Test-Path $installDir) {
  $it = Get-Item $installDir
  if ($it.LinkType) {
    try {
      [System.IO.Directory]::Delete($installDir)
      Write-Host "[1/3] 已删除安装副本联接（仅链接，目标保留）" -ForegroundColor Green
    } catch {
      & cmd /c "rmdir `"$installDir`"" | Out-Null
      Write-Host "[1/3] 已删除安装副本联接（cmd rmdir 方式）" -ForegroundColor Green
    }
  } else {
    Remove-Item $installDir -Recurse -Force
    Write-Host "[1/3] 已删除安装副本 $installDir" -ForegroundColor Green
  }
} else {
  Write-Host "[1/3] 安装副本不存在，跳过"
}

# 2) package.json 注册
if (Test-Path $webPkgFile) {
  $pkg = Get-Content $webPkgFile -Raw | ConvertFrom-Json
  $changed = $false
  if ($pkg.dependencies -and $pkg.dependencies.PSObject.Properties['prompt-enhance']) {
    $pkg.dependencies.PSObject.Properties.Remove('prompt-enhance')
    $changed = $true
  }
  if ($pkg.dsh -and $pkg.dsh.profile -and @($pkg.dsh.profile.bundles) -contains 'prompt-enhance') {
    $pkg.dsh.profile.bundles = @($pkg.dsh.profile.bundles | Where-Object { $_ -ne 'prompt-enhance' })
    $changed = $true
  }
  if ($changed) {
    [System.IO.File]::WriteAllText($webPkgFile, ($pkg | ConvertTo-Json -Depth 12), (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "[2/3] 已移除 profiles\web\package.json 中的注册" -ForegroundColor Green
  } else {
    Write-Host "[2/3] package.json 无注册，跳过"
  }
} else {
  Write-Host "[2/3] 未找到 $webPkgFile，跳过"
}

# 3) 联接（只删链接，不删目标）
$link = Get-Item $pluginLink -ErrorAction SilentlyContinue
if ($link -and $link.LinkType -eq 'Junction') {
  try {
    [System.IO.Directory]::Delete($pluginLink)
    Write-Host "[3/3] 已删除联接 plugins\prompt-enhance（目标源码保留）" -ForegroundColor Green
  } catch {
    & cmd /c "rmdir `"$pluginLink`"" | Out-Null
    Write-Host "[3/3] 已删除联接（cmd rmdir 方式）" -ForegroundColor Green
  }
} elseif ($link) {
  Write-Warning "[3/3] plugins\prompt-enhance 不是联接，未删除（避免误删真实目录）。请手动处理。"
} else {
  Write-Host "[3/3] 联接不存在，跳过"
}

Write-Host ""
Write-Host "卸载完成。请重启 dsh web。" -ForegroundColor Yellow
