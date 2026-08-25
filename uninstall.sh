#!/usr/bin/env bash
set -euo pipefail

# prompt-enhance 卸载脚本（安全）
# 用法：./uninstall.sh [-f]   (-f 跳过确认)

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
FORCE=false
while getopts "f" opt; do
  case "$opt" in
    f) FORCE=true ;;
    *) echo "用法: $0 [-f]" >&2; exit 1 ;;
  esac
done

PLUGIN_LINK="$DSH_HOME/plugins/prompt-enhance"
INSTALL_DIR_NEW="$DSH_HOME/profiles/web/node_modules/@lidaxi/prompt-enhance"
INSTALL_DIR_OLD="$DSH_HOME/profiles/web/node_modules/prompt-enhance"
WEB_PKG="$DSH_HOME/profiles/web/package.json"

echo "即将从 DSH（$DSH_HOME）卸载 prompt-enhance 插件。"
echo "  源码仓库 $(cd "$(dirname "$0")" && pwd) 不会被删除。"
if [[ "$FORCE" != true ]]; then
  read -p "确认继续？[y/N] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消。"
    exit 0
  fi
fi

# 1) 安装副本（兼容新老包名）
for d in "$INSTALL_DIR_NEW" "$INSTALL_DIR_OLD"; do
  if [[ -e "$d" ]]; then
    rm -rf "$d"
    echo "[1/3] 已删除安装副本 $d"
  else
    echo "[1/3] 安装副本不存在，跳过: $d"
  fi
done

# 2) package.json 注册
if [[ -f "$WEB_PKG" ]]; then
  if command -v jq >/dev/null 2>&1; then
    TMP="$(mktemp)"
    jq 'del(.dependencies["prompt-enhance"], .dependencies["@lidaxi/prompt-enhance"]) |
        .dsh.profile.bundles |= map(select(. != "prompt-enhance" and . != "@lidaxi/prompt-enhance"))' \
       "$WEB_PKG" > "$TMP"
    mv "$TMP" "$WEB_PKG"
    echo "[2/3] 已移除 profiles/web/package.json 中的注册"
  else
    echo "警告: 未安装 jq，无法自动修改 package.json。请手动移除依赖和 bundle。" >&2
  fi
else
  echo "[2/3] 未找到 $WEB_PKG，跳过"
fi

# 3) 联接（只删链接，不删目标）
if [[ -L "$PLUGIN_LINK" ]]; then
  rm -f "$PLUGIN_LINK"
  echo "[3/3] 已删除联接 plugins/prompt-enhance（目标源码保留）"
elif [[ -e "$PLUGIN_LINK" ]]; then
  echo "警告: plugins/prompt-enhance 不是符号链接，未删除（避免误删真实目录）。请手动处理。" >&2
else
  echo "[3/3] 联接不存在，跳过"
fi

echo ""
echo "卸载完成。请重启 dsh web。"