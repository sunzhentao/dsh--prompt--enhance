#!/usr/bin/env bash
set -euo pipefail

# prompt-enhance 安装 / 同步脚本（幂等，可重复执行）
# 用法：在仓库目录执行 ./install.sh
# 或指定 DSH 主目录：DSH_HOME=/path/to/.dsh ./install.sh

SRC="$(cd "$(dirname "$0")" && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"

if [[ ! -f "$SRC/lib/index.js" ]]; then
  echo "错误：未在插件源码目录运行（找不到 $SRC/lib/index.js）" >&2
  exit 1
fi

echo "==> 插件源码: $SRC"
echo "==> DSH 主目录: $DSH_HOME"

PLUGIN_LINK="$DSH_HOME/plugins/prompt-enhance"
INSTALL_DIR="$DSH_HOME/profiles/web/node_modules/prompt-enhance"
WEB_PKG="$DSH_HOME/profiles/web/package.json"
SYNC_FILES=("lib/index.js" "lib/client.js" "package.json" "README.md" "LICENSE" "cordis.patch.yml")

# 1) 源码联接
mkdir -p "$(dirname "$PLUGIN_LINK")"
if [[ -L "$PLUGIN_LINK" && "$(readlink "$PLUGIN_LINK")" == "$SRC" ]]; then
  echo "[1/4] 联接已就绪: plugins/prompt-enhance -> $SRC"
elif [[ -L "$PLUGIN_LINK" ]]; then
  echo "警告: plugins/prompt-enhance 已指向别处 ($(readlink "$PLUGIN_LINK"))，跳过。" >&2
elif [[ -e "$PLUGIN_LINK" ]]; then
  echo "警告: plugins/prompt-enhance 已存在且不是联接（真实目录）。如想改用本仓库，请先删除该目录后重跑。" >&2
else
  ln -s "$SRC" "$PLUGIN_LINK"
  echo "[1/4] 已创建符号链接: plugins/prompt-enhance -> $SRC"
fi

# 2) web profile 检查
if [[ ! -d "$DSH_HOME/profiles/web" ]]; then
  echo "警告: 未检测到 web profile（$DSH_HOME/profiles/web）。请先启用 dsh web profile，再重跑本脚本完成注册与同步。" >&2
  exit 0
fi

# 3) 同步安装副本
mkdir -p "$INSTALL_DIR/lib"
for f in "${SYNC_FILES[@]}"; do
  src_file="$SRC/$f"
  dst_file="$INSTALL_DIR/$f"
  if [[ -f "$src_file" ]]; then
    if [[ -e "$dst_file" ]]; then
      rm -f "$dst_file"
    fi
    cp "$src_file" "$dst_file"
  fi
done

# 校验一致性
MISMATCH=()
for f in "${SYNC_FILES[@]}"; do
  src_file="$SRC/$f"
  dst_file="$INSTALL_DIR/$f"
  if [[ -f "$src_file" ]]; then
    if [[ ! -f "$dst_file" ]] || ! cmp -s "$src_file" "$dst_file"; then
      MISMATCH+=("$f")
    fi
  fi
done

if [[ ${#MISMATCH[@]} -eq 0 ]]; then
  echo "[3/4] 安装副本已同步，6 个文件校验一致"
else
  echo "错误: 安装副本校验不一致: ${MISMATCH[*]}" >&2
  exit 1
fi

# 语法校验
for js in "lib/index.js" "lib/client.js"; do
  if ! node --check "$INSTALL_DIR/$js" 2>/dev/null; then
    echo "语法错误 $js —— 请修复后再重启。" >&2
    exit 1
  fi
done
echo "      node --check 通过"

# 4) 注册依赖与 bundle
if [[ ! -f "$WEB_PKG" ]]; then
  echo "警告: 未找到 $WEB_PKG，跳过注册。" >&2
else
  # 使用 jq 修改 package.json（如果系统没有 jq，则 fallback 到手动方法）
  if command -v jq >/dev/null 2>&1; then
    TMP="$(mktemp)"
    jq --arg dep "file:../../plugins/prompt-enhance" \
       '.dependencies["prompt-enhance"] = $dep |
        .dsh.profile.bundles += ["prompt-enhance"] |
        .dsh.profile.bundles |= unique' \
       "$WEB_PKG" > "$TMP"
    mv "$TMP" "$WEB_PKG"
    echo "[4/4] 已在 profiles/web/package.json 注册依赖与 bundle"
  else
    echo "警告: 未安装 jq，无法自动修改 package.json。请手动添加依赖和 bundle。" >&2
    echo "   依赖: \"prompt-enhance\": \"file:../../plugins/prompt-enhance\"" >&2
    echo "   bundle: \"prompt-enhance\"" >&2
  fi
fi

echo ""
echo "安装/同步完成。请重启 dsh web 并刷新页面使改动生效。"