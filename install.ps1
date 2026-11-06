# dsh-spinner-words 安装脚本
# 纯插件安装：不改任何 @deepseek-ai/dsh-* 源码。
#   1) 把插件包放进 profiles 的 node_modules（Junction 链接，与其他 dsh 插件同一约定）
#   2) 在 profile 的 cordis.patch.yml 注册一行 insert
#   3) 完全重启 DSH（结束进程，不是关窗口）生效
[CmdletBinding()]
param(
  [string]$PluginSource,
  [string]$ProfileDir,
  [string]$DshHome
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $DshHome) { $DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' } }
if (-not $ProfileDir) {
  # 优先 desktop profile（桌面版），否则 web
  if (Test-Path (Join-Path $DshHome 'profiles\desktop')) { $ProfileDir = Join-Path $DshHome 'profiles\desktop' }
  else { $ProfileDir = Join-Path $DshHome 'profiles\web' }
}
if (-not $PluginSource) { $PluginSource = $PSScriptRoot }
$PluginSource = (Resolve-Path -LiteralPath $PluginSource).Path

# ---- 读取插件名 ----
$pkg = Get-Content -LiteralPath (Join-Path $PluginSource 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$name = $pkg.name
if (-not $name) { throw 'package.json missing "name"' }
if (-not $pkg.'dsh'.client -or $pkg.'dsh'.client.platform -ne 'web') {
  throw "$name 缺少 dsh.client.platform = web 声明，DSH 客户端不会加载它"
}
if (-not $pkg.exports.'./client') { throw "$name 缺少 exports['./client']，客户端模块系统找不到 bundle" }

Write-Host "-> plugin : $name ($PluginSource)"
Write-Host "-> profile: $ProfileDir"

# ---- 1) 链接到 profiles node_modules ----
$nmDir = Split-Path -Parent $ProfileDir
$target = Join-Path $nmDir 'node_modules'
if (-not (Test-Path -LiteralPath $target)) { New-Item -ItemType Directory -Path $target -Force | Out-Null }
$link = Join-Path $target $name
if (Test-Path -LiteralPath $link) {
  $it = Get-Item -LiteralPath $link -Force
  if ($it.LinkType -eq 'Junction' -and $it.Target -eq $PluginSource) {
    Write-Host "-> link OK (already exists): $link"
  } else {
    throw "目标已存在但不是指向本插件的 Junction：$link （请先手动删除再重跑）"
  }
} else {
  # Junction 本身无需管理员权限；用 PowerShell 原生 cmdlet（不依赖 cmd.exe，
  # 策略禁用 cmd 的环境下也能工作）。失败（权限/文件系统限制）时退化为复制。
  try {
    New-Item -ItemType Junction -Path $link -Target $PluginSource | Out-Null
    Write-Host "-> junction created: $link"
  } catch {
    # 复制兜底按 package.json files 白名单拷贝（npm pack 同款语义：
    # package.json 始终隐式包含，files 列表只是追加），不把 .git 等
    # 开发产物带进 profile 的 node_modules。
    $files = @('package.json')
    if ($pkg.files) { $files += @($pkg.files) }
    $files = $files | Select-Object -Unique
    New-Item -ItemType Directory -Path $link -Force | Out-Null
    foreach ($f in $files) {
      Copy-Item -LiteralPath (Join-Path $PluginSource $f) -Destination $link -Recurse -Force
    }
    Write-Host "-> copied (junction unavailable, files whitelist): $link"
  }
}

# ---- 验证 require 能解析到 ----
if (-not (Test-Path -LiteralPath (Join-Path $target "$name/package.json"))) {
  throw "布局验证失败：$target\$name\package.json 不可达——DSH 客户端模块系统将无法加载"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "node 不在 PATH——DSH 本体依赖 node，请先安装 node 后重跑本脚本"
}
Push-Location $ProfileDir
$nodeLaunchFailed = $false
$resolved = $null
try {
  $resolved = node -e "console.log(require.resolve('$name/package.json'))" 2>$null
} catch {
  $nodeLaunchFailed = $true
} finally {
  Pop-Location
}
if ($nodeLaunchFailed) {
  Write-Host "-> layout OK (node launch blocked by environment, skipped require.resolve): $target"
} elseif (-not $resolved) {
  throw "require.resolve('$name') 失败——DSH 客户端模块系统将无法加载"
} else {
  Write-Host "-> resolvable: $resolved"
}

# ---- 2) 注册到 cordis.patch.yml ----
$patchFile = Join-Path $ProfileDir 'cordis.patch.yml'
$patchText = if (Test-Path -LiteralPath $patchFile) { [IO.File]::ReadAllText($patchFile) } else { '' }
# 去掉文件顶部可能的空 `[]`（空 profile 占位）
$patchText = [regex]::Replace($patchText, '(?m)^\s*\[\s*\]\s*\r?\n?', '')
if ($patchText -notmatch "(?m)^\s*- id: $([regex]::Escape($name))\s*$") {
  if ($patchText.Trim() -eq '') {
    $patchText = "- insert:`n    - id: $name`n      name: '$name'`n"
  } else {
    $patchText = $patchText.TrimEnd() + "`n`n- insert:`n    - id: $name`n      name: '$name'`n"
  }
  [IO.File]::WriteAllText($patchFile, $patchText, [Text.UTF8Encoding]::new($false))
  Write-Host "-> registered in $patchFile"
} else {
  Write-Host "-> already registered in $patchFile"
}

Write-Host ''
Write-Host '安装完成。下一步：'
Write-Host '  1) 完全退出 DSH（不是关窗口，是结束 dsh 进程）'
Write-Host '  2) 重新启动 DSH'
Write-Host '  3) 浏览器刷新页面（若 DSH 自带窗口则重启即可）'
Write-Host '验证：随便发一条消息让模型跑起来，思考状态行应显示随机中文短语（如「凿壁偷光中…」）。'
Write-Host ''
Write-Host '注意：若同时装了 dsh-deep-verbs，请二选一（两者抢同一个状态行文本节点）。'
