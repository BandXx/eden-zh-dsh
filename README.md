# Eden 汉化部署 · DSH Bundle

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey.svg)]()
[![DSH](https://img.shields.io/badge/DeepSeek%20Harness-bundle-6b5bff.svg)]()

给 [Eden](https://eden.so) 桌面版装的**简体中文汉化**，通过 [DeepSeek Harness](https://github.com/deepseek-ai) 一句话部署到任意一台 Mac。

Eden 是 Tauri 应用，前端资源压在 108 MB 的主可执行文件里，直接改文件不现实。这个补丁走运行时注入：复制一份 app，用启动器把 `libEdenZh.dylib` 塞进进程，dylib swizzle `-[WKWebView initWithFrame:configuration:]`，给每个 WebView 挂一段 `WKUserScript`，遍历 DOM（含 Shadow DOM）把英文换成中文。

**原版 Eden 全程不改动。**

## 装插件

有 DSH 的话，直接在对话里说：

```
安装 /绝对路径/eden-zh-dsh 这个插件
```

Agent 会调 `plugin_manager` 的 `install_bundle`，装好后插件设置里出现「Eden 汉化部署」。

手动装也可以：

```bash
gh repo clone <owner>/eden-zh-dsh
# 然后在 DSH 里 install_bundle → target: /绝对路径/eden-zh-dsh
```

## 三个工具

| 工具 | 作用 |
|---|---|
| `eden_zh_status` | 只读检查：装没装、词典多少条、启动器是否接管、原版在哪 |
| `eden_zh_deploy` | 一键安装/更新，可选 `app_path` 指定 Eden.app 位置 |
| `eden_zh_uninstall` | 删掉汉化版，原版不受影响 |

对话示例：

```
把汉化装到 Eden 上                      → eden_zh_deploy
Eden 在 ~/Downloads/Eden.app 里         → eden_zh_deploy(app_path="~/Downloads/Eden.app")
看看装好了没                            → eden_zh_status
```

## 不用 DSH 也能装

`assets/deploy.sh` 是自包含的：

```bash
bash assets/deploy.sh              # 安装/更新
bash assets/deploy.sh --status     # 查看
bash assets/deploy.sh --uninstall  # 卸载
bash assets/deploy.sh --app /path/to/Eden.app
```

## 安装器做了什么

1. 找 `Eden.app`：`/Applications` → `~/Applications` → 所有挂载卷 → `mdfind`，或用 `--app` 指定
2. `ditto` 复制成 `~/Applications/Eden（汉化）.app`
3. `Contents/MacOS/canvas-desktop` → `canvas-desktop-real`，换成 shell 启动器：

   ```sh
   DIR=$(cd "$(dirname "$0")" && pwd)
   RES="$DIR/../Resources/eden-zh"
   export EDEN_ZH_DIR="$RES"
   export DYLD_INSERT_LIBRARIES="$RES/libEdenZh.dylib"
   exec "$DIR/canvas-desktop-real" "$@"
   ```

4. 部署 `eden-zh.json` + `eden-zh.js` + `libEdenZh.dylib` 到 `Contents/Resources/eden-zh/`
5. `CFBundleDisplayName` 改为「Eden（汉化）」，`codesign --force --deep --sign -`，清 quarantine

## 替换引擎

`assets/eden-zh.js` 是纯 DOM 层的工作，不碰 Eden 的包内资源：

- **精确词典**：`{"English": "中文"}`，约 9960 条
- **模板匹配**：源串里的 `${e}` 编译成正则，译文用 `{0}` `{1}` 回填
- **防混排**：句子（>3 词）只接受整句命中，半截译文（「获取 your first digital product…」）直接丢弃。
  判定靠 `residue()`——译文里若残留非白名单英文整词就判不合格。白名单是 Eden/Eve/Claude/MCP/API/PDF 这类专名。
- **标签例外**：≤3 词且不含 any/the/of/your 这类功能词，才允许走模式匹配
- **Shadow DOM**：`walk()` 递归 `shadowRoot`，深度上限 24——Eden 的设置页是自定义元素，不穿透就问不到
- **拆分句子合并**：相邻内联标签（span/b/em…）拼回整句再翻，避免逐词拼接
- **MutationObserver**：新渲染的内容持续处理
- **属性**：`placeholder` / `title` / `aria-label` / `alt` / `data-tooltip` 等一并替换

改词典：编辑 `eden-zh.json`，重启 Eden 即生效，不用重装。

## 架构兼容

`assets/libEdenZh.dylib` 是 **arm64** 预编译版本。Intel Mac 上 `deploy.sh` 会检测到架构不符，用 `assets/edenzh_inject.m` 现场 `clang` 编译对应架构（需要 `xcode-select --install`）。

## 已知边界

- 图片里的文字、用户自己写的内容不翻译
- Eden 自更新若替换了 `canvas-desktop-real`，汉化会失效 —— 重跑一次 `eden_zh_deploy`
- 仅 macOS
- ad-hoc 签名，首次打开可能需要右键 → 打开

## 目录

```
eden-zh-dsh/
├── index.js              三个工具的 Host 实现
├── cordis.patch.yml      bundle 加载入口
├── package.json          DSH bundle 清单
├── icon.svg  locale/     插件元数据
├── assets/
│   ├── deploy.sh         安装/卸载/状态
│   ├── eden-zh.json      9960 条词条
│   ├── eden-zh.js        DOM 替换引擎
│   ├── edenzh_inject.m   注入器源码
│   └── libEdenZh.dylib   预编译注入器（arm64）
└── LICENSE
```

## 许可

MIT。注入器与替换引擎为本仓库原创；Eden 本身的版权归其作者。
