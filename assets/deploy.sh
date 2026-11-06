#!/bin/bash
# Eden 汉化部署器（由 DSH 插件 eden-zh-dsh 调用，也可单独在终端运行）
# 用法：
#   ./deploy.sh                 安装/更新汉化版 Eden
#   ./deploy.sh --uninstall     卸载汉化版（保留原版）
#   ./deploy.sh --status        查看状态
#   ./deploy.sh --app <路径>    指定 Eden.app 位置
#   ./deploy.sh --backups       列出已有备份
set -uo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 资产目录：优先取脚本同级的 assets/，若脚本本身就在 assets/ 里则直接用所在目录
ASSETS="$SELF_DIR/assets"
[ -f "$ASSETS/eden-zh.js" ] || ASSETS="$SELF_DIR"
APP_NAME="Eden（汉化）"
STATUS=0

# 安装/卸载前的备份都放这里，每份一个时间戳目录，默认只留最近 3 份
DATA_DIR="$HOME/Library/Application Support/EdenZh"
BACKUP_ROOT="$DATA_DIR/backup"
KEEP_BACKUPS=3

say() { printf '%s\n' "$*"; }
err() { printf '✗ %s\n' "$*" >&2; STATUS=1; }
warn() { printf '⚠ %s\n' "$*" >&2; }

find_app() {
  local c
  for c in "/Applications/Eden.app" "$HOME/Applications/Eden.app"; do
    [ -d "$c" ] && { printf "%s" "$c"; return 0; }
  done
  for c in /Volumes/*/Eden.app; do
    [ -d "$c" ] && { printf "%s" "$c"; return 0; }
  done
  mdfind -name "Eden.app" 2>/dev/null | grep -v '汉化' | head -1
}

# 从 app bundle 的 Info.plist 读 CFBundleShortVersionString；读不到返回空串
read_bundle_version() {
  local app="$1" v=""
  [ -f "$app/Contents/Info.plist" ] || { printf ""; return 0; }
  v="$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$app/Contents/Info.plist" 2>/dev/null)"
  # 兜底：PlistBuddy 缺失或键类型异常时退回 plutil
  [ -n "$v" ] || v="$(plutil -extract CFBundleShortVersionString raw -o - "$app/Contents/Info.plist" 2>/dev/null)"
  printf "%s" "$v"
}

# 读汉化版落地时记录的适配信息（adapter.txt 的 key=value 行）
read_adapter_field() {
  local file="$1" key="$2"
  [ -f "$file" ] || { printf ""; return 0; }
  sed -n "s/^${key}=//p" "$file" 2>/dev/null | head -1
}

# 备份整个 app bundle 到 $BACKUP_ROOT/<时间戳>/，成功打印备份目录路径
# 失败返回 1，调用方必须中止后续破坏性操作
backup_installed() {
  local src="$1" label="$2" stamp dest
  [ -e "$src" ] || return 0
  stamp="$(date +%Y%m%d-%H%M%S)"
  dest="$BACKUP_ROOT/$stamp"
  # 同一秒内重复调用时顺延后缀，绝不覆盖已有备份
  if [ -e "$dest" ]; then dest="${dest}-$$"; fi
  if ! mkdir -p "$dest"; then
    err "无法创建备份目录 $dest"
    return 1
  fi
  # ditto 保留资源分叉、签名与权限，比 cp -R 更适合 app bundle
  if ! ditto "$src" "$dest/$APP_NAME.app" 2>/dev/null; then
    rm -rf "$dest"
    err "备份失败（${label}）：$src"
    return 1
  fi
  {
    printf 'time='
    date '+%Y-%m-%d %H:%M:%S'
    printf 'reason=%s\n' "$label"
    printf 'version=%s\n' "$(read_bundle_version "$src")"
    printf 'source=%s\n' "$src"
  } > "$dest/manifest.txt" 2>/dev/null || true
  say "已备份 $label → $dest"
  prune_backups
  printf "%s" "$dest"
}

# 只保留最近 $KEEP_BACKUPS 份，时间戳目录名天然可排序
prune_backups() {
  local -a dirs=()
  local d
  [ -d "$BACKUP_ROOT" ] || return 0
  while IFS= read -r d; do [ -n "$d" ] && dirs+=("$d"); done < <(ls -1d "$BACKUP_ROOT"/*/ 2>/dev/null | sed 's:/*$::' | sort)
  local n=${#dirs[@]}
  [ "$n" -gt "$KEEP_BACKUPS" ] || return 0
  local i=0 drop=$((n - KEEP_BACKUPS))
  while [ "$i" -lt "$drop" ]; do
    rm -rf "${dirs[$i]}" && say "清理旧备份：$(basename "${dirs[$i]}")"
    i=$((i + 1))
  done
  return 0
}

cmd_backups() {
  [ -d "$BACKUP_ROOT" ] || { say "还没有备份（${BACKUP_ROOT}）。"; return 0; }
  local d any=0
  while IFS= read -r d; do
    [ -n "$d" ] || continue
    any=1
    say "$(basename "$d")  原因 $(sed -n 's/^reason=//p' "$d/manifest.txt" 2>/dev/null)  适配版本 $(sed -n 's/^version=//p' "$d/manifest.txt" 2>/dev/null)"
    du -sh "$d/$APP_NAME.app" 2>/dev/null | awk '{print "    大小 " $1}'
  done < <(ls -1d "$BACKUP_ROOT"/*/ 2>/dev/null | sed 's:/*$::' | sort -r)
  [ "$any" = 1 ] || say "还没有备份（${BACKUP_ROOT}）。"
}

cmd_status() {
  local target="$HOME/Applications/$APP_NAME.app"
  if [ -d "$target" ]; then
    local res="$target/Contents/Resources/eden-zh"
    local adapter="$res/adapter.txt"
    local installed_ver recorded_ver installed_at
    installed_ver="$(read_bundle_version "$target")"
    recorded_ver="$(read_adapter_field "$adapter" version)"
    installed_at="$(read_adapter_field "$adapter" installed_at)"
    say "已安装：$target"
    say "启动器：$( [ -f "$target/Contents/MacOS/canvas-desktop-real" ] && echo 已接管 || echo 未接管 )"
    say "词典：$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1]))))" "$res/eden-zh.json" 2>/dev/null || echo 未知) 条"
    say "适配版本：${recorded_ver:-未记录（旧版安装，重新 install 可补录）}${installed_at:+　安装于 $installed_at}"
    if [ -n "$recorded_ver" ] && [ -n "$installed_ver" ] && [ "$recorded_ver" != "$installed_ver" ]; then
      say "当前 bundle 版本：${installed_ver}（与适配版本不一致，可能是手动替换过）"
    fi
    local nbackup="0"
    if [ -d "$BACKUP_ROOT" ]; then
      nbackup="$(ls -1d "$BACKUP_ROOT"/*/ 2>/dev/null | wc -l | tr -d ' ')"
    fi
    say "备份：$nbackup 份 → $BACKUP_ROOT"
  else
    say "未安装汉化版。"
  fi
  say "原版：$(find_app || echo 未找到)"
}

cmd_uninstall() {
  local target="$HOME/Applications/$APP_NAME.app"
  [ -d "$target" ] || { say "没有安装汉化版，无需卸载。"; return 0; }
  pkill -f "$target/Contents/MacOS/canvas-desktop-real" 2>/dev/null
  # 卸载也是破坏性操作，先备份，失败就中止（保留可回滚副本）
  backup_installed "$target" "uninstall" >/dev/null || { err "备份失败，已中止卸载"; STATUS=1; return 1; }
  rm -rf "$target"
  say "已删除 ${target}（原版未受影响，备份在 ${BACKUP_ROOT}）。"
}

cmd_install() {
  local src="${1:-$(find_app)}"
  [ -n "$src" ] && [ -d "$src" ] || { err "没找到 Eden.app。用 --app 指定路径。"; return 1; }
  local target="$HOME/Applications/$APP_NAME.app"

  local src_ver
  src_ver="$(read_bundle_version "$src")"
  say "源版本：$src"
  [ -n "$src_ver" ] && say "源 app 版本：$src_ver" || warn "源 app 未声明 CFBundleShortVersionString，版本校验跳过"
  command -v codesign >/dev/null || { err "缺少 codesign"; return 1; }

  # 版本校验：已装汉化包是为哪个源版本做的，跟这次的源不一致就提示（不阻断）
  local adapter="$target/Contents/Resources/eden-zh/adapter.txt"
  local prev_ver
  prev_ver="$(read_adapter_field "$adapter" version)"
  if [ -n "$prev_ver" ] && [ -n "$src_ver" ] && [ "$prev_ver" != "$src_ver" ]; then
    warn "已装汉化包是为 Eden $prev_ver 做的；本次源 app 是 ${src_ver}。更新后原版界面若有新文案可能漏译。"
    warn "旧安装时间：$(sed -n 's/^installed_at=//p' "$adapter" 2>/dev/null | head -1)"
  elif [ -n "$adapter" ] && [ ! -f "$adapter" ]; then
    say "旧安装无版本记录（升级自 1.0 之前），本次会写入适配版本。"
  fi

  pkill -f "Eden.app/Contents/MacOS/canvas-desktop" 2>/dev/null
  pkill -f "$target/Contents/MacOS/canvas-desktop-real" 2>/dev/null
  sleep 1
  if [ -d "$target" ]; then
    say "移除旧的汉化版…"
    # 先备份再删：备份失败直接中止，绝不留下没有回滚点的状态
    backup_installed "$target" "install" >/dev/null || { err "备份失败，已中止安装（旧汉化版未改动）"; STATUS=1; return 1; }
    rm -rf "$target"
  fi

  say "复制到 $target …"
  mkdir -p "$HOME/Applications"
  ditto "$src" "$target" || { err "复制失败"; return 1; }

  local macos="$target/Contents/MacOS"
  local real="$macos/canvas-desktop-real"
  if [ ! -f "$real" ]; then
    [ -f "$macos/canvas-desktop" ] || { err "找不到主程序 canvas-desktop"; return 1; }
    mv "$macos/canvas-desktop" "$real"
  fi

  local res="$target/Contents/Resources/eden-zh"
  mkdir -p "$res"
  cp "$ASSETS/eden-zh.js" "$ASSETS/eden-zh.json" "$res/" || { err "复制脚本/词典失败"; return 1; }

  # 适配记录：install 时固化「这份汉化是为哪个源版本做的」，重复安装据此比对
  cat > "$res/adapter.txt" <<ADAPTER
version=${src_ver:-unknown}
source=${src}
installed_at=$(date +%Y-%m-%d\ %H:%M:%S)
deploy_script=$SELF_DIR/assets/deploy.sh
ADAPTER
  say "已写入适配版本：${src_ver:-unknown} → $res/adapter.txt"

  # 注入器：优先用现成 dylib，架构不符则用源码现场编译
  local dylib="$res/libEdenZh.dylib"
  local arch
  arch="$(uname -m)"
  cp "$ASSETS/libEdenZh.dylib" "$dylib" 2>/dev/null || true
  if ! lipo -archs "$dylib" 2>/dev/null | grep -q "$arch"; then
    say "现成注入器架构不符（需要 ${arch}），现场编译…"
    xcode-select -p >/dev/null 2>&1 || { err "需要 Xcode Command Line Tools：xcode-select --install"; return 1; }
    clang -dynamiclib -fobjc-arc -fmodules -arch "$arch" \
      -framework Cocoa -framework WebKit \
      -o "$dylib" "$ASSETS/edenzh_inject.m" || { err "注入器编译失败"; return 1; }
  fi
  codesign --force --sign - "$dylib" >/dev/null 2>&1

  # 启动器：设好 EDEN_ZH_DIR 与 DYLD_INSERT_LIBRARIES 后 exec 真身
  cat > "$macos/canvas-desktop" <<'LAUNCHER'
#!/bin/sh
DIR=$(cd "$(dirname "$0")" && pwd)
RES="$DIR/../Resources/eden-zh"
export EDEN_ZH_DIR="$RES"
export DYLD_INSERT_LIBRARIES="$RES/libEdenZh.dylib"
exec "$DIR/canvas-desktop-real" "$@"
LAUNCHER
  chmod +x "$macos/canvas-desktop"

  /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName $APP_NAME" "$target/Contents/Info.plist" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string $APP_NAME" "$target/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c "Set :CFBundleName $APP_NAME" "$target/Contents/Info.plist" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :CFBundleName string $APP_NAME" "$target/Contents/Info.plist"

  say "重新签名…"
  codesign --remove-signature "$target" >/dev/null 2>&1
  codesign --force --deep --sign - "$target" >/dev/null 2>&1 || { err "签名失败"; return 1; }
  xattr -dr com.apple.quarantine "$target" 2>/dev/null

  local n
  n=$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1]))))" "$res/eden-zh.json") || n="?"
  say "完成：$target"
  local dylib_name
  dylib_name="$(basename "$dylib")"
  say "  词典 ${n} 条，注入器 ${dylib_name}，架构 ${arch}，适配版本 ${src_ver:-unknown}"
  say "打开方式：访达 → 应用程序 → $APP_NAME"
}

case "${1:-install}" in
  --status) cmd_status ;;
  --uninstall) cmd_uninstall ;;
  --backups) cmd_backups ;;
  --app) cmd_install "${2:-}" ;;
  install|"") cmd_install ;;
  *) say "用法：$0 [install|--status|--uninstall|--backups|--app <Eden.app 路径>]" ;;
esac
exit $STATUS
