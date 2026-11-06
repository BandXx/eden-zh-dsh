#!/bin/bash
# Eden 汉化部署器（由 DSH 插件 eden-zh-dsh 调用，也可单独在终端运行）
# 用法：
#   ./deploy.sh                 安装/更新汉化版 Eden
#   ./deploy.sh --uninstall     卸载汉化版（保留原版）
#   ./deploy.sh --status        查看状态
#   ./deploy.sh --app <路径>    指定 Eden.app 位置
set -uo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSETS="$SELF_DIR/assets"
APP_NAME="Eden（汉化）"
STATUS=0

say() { printf '%s\n' "$*"; }
err() { printf '✗ %s\n' "$*" >&2; STATUS=1; }

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

cmd_status() {
  local target="$HOME/Applications/$APP_NAME.app"
  if [ -d "$target" ]; then
    say "已安装：$target"
    say "启动器：$( [ -f "$target/Contents/MacOS/canvas-desktop-real" ] && echo 已接管 || echo 未接管 )"
    say "词典：$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1]))))" "$target/Contents/Resources/eden-zh/eden-zh.json" 2>/dev/null || echo 未知) 条"
  else
    say "未安装汉化版。"
  fi
  say "原版：$(find_app || echo 未找到)"
}

cmd_uninstall() {
  local target="$HOME/Applications/$APP_NAME.app"
  [ -d "$target" ] || { say "没有安装汉化版，无需卸载。"; return 0; }
  pkill -f "$target/Contents/MacOS/canvas-desktop-real" 2>/dev/null
  rm -rf "$target"
  say "已删除 $target（原版未受影响）。"
}

cmd_install() {
  local src="${1:-$(find_app)}"
  [ -n "$src" ] && [ -d "$src" ] || { err "没找到 Eden.app。用 --app 指定路径。"; return 1; }
  local target="$HOME/Applications/$APP_NAME.app"

  say "源版本：$src"
  command -v codesign >/dev/null || { err "缺少 codesign"; return 1; }

  pkill -f "Eden.app/Contents/MacOS/canvas-desktop" 2>/dev/null
  pkill -f "$target/Contents/MacOS/canvas-desktop-real" 2>/dev/null
  sleep 1
  if [ -d "$target" ]; then
    say "移除旧的汉化版…"
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

  # 注入器：优先用现成 dylib，架构不符则用源码现场编译
  local dylib="$res/libEdenZh.dylib"
  local arch
  arch="$(uname -m)"
  cp "$ASSETS/libEdenZh.dylib" "$dylib" 2>/dev/null || true
  if ! lipo -archs "$dylib" 2>/dev/null | grep -q "$arch"; then
    say "现成注入器架构不符（需要 $arch），现场编译…"
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
  say "完成：$target（词典 $n 条，注入器 $(basename "$dylib")，架构 $arch）"
  say "打开方式：访达 → 应用程序 → $APP_NAME"
}

case "${1:-install}" in
  --status) cmd_status ;;
  --uninstall) cmd_uninstall ;;
  --app) cmd_install "${2:-}" ;;
  install|"") cmd_install ;;
  *) say "用法：$0 [install|--status|--uninstall|--app <Eden.app 路径>]" ;;
esac
exit $STATUS
