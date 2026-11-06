// eden-zh-dsh — 把 Eden 汉化补丁装到本机 macOS 上的 Eden.app
//
// 三个工具：
//   eden_zh_status     查看当前安装状态（是否已汉化、词典条数、原版位置）
//   eden_zh_deploy     安装/更新汉化版（复制 app、接管启动器、重签名、部署词典与注入器）
//   eden_zh_uninstall  删除汉化版，原版不受影响
//
// 原理：Eden 是 Tauri 应用，前端资源压在主可执行文件里，无法直接改文件。
// 因此复制一份 app，把主程序改名为 canvas-desktop-real，用 shell 启动器设好
// EDEN_ZH_DIR 与 DYLD_INSERT_LIBRARIES 后 exec 真身；注入器用 swizzle 给
// WKWebView 挂 WKUserScript，运行时把界面英文替换成中文。
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

export const name = 'eden-zh-dsh'
export const inject = ['tools']

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(HERE, 'assets', 'deploy.sh')
const APP_NAME = 'Eden（汉化）'

function run(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn('/bin/bash', [SCRIPT, ...args], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { err += chunk })
    const timer = options.timeoutMs
      ? setTimeout(() => child.kill('SIGTERM'), options.timeoutMs)
      : undefined
    child.on('error', (error) => {
      if (timer) clearTimeout(timer)
      resolve({ code: -1, out, err: err + String(error) })
    })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      resolve({ code: code ?? -1, out, err })
    })
  })
}

function report(result) {
  const body = [result.out.trim(), result.err.trim()].filter(Boolean).join('\n')
  return `exit=${result.code}\n${body || '(无输出)'}`
}

export function apply(ctx) {
  if (!fs.existsSync(SCRIPT)) {
    ctx.logger?.warn?.(`eden-zh-dsh: 缺少部署脚本 ${SCRIPT}`)
    return
  }

  ctx.tools.register({
    name: 'eden_zh_status',
    description:
      '查看这台 Mac 上 Eden 汉化的情况：汉化版是否已安装、词典条数、启动器是否已接管、原版 Eden.app 的位置。只读，不修改任何文件。',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() {
      return report(await run(['--status']))
    },
    presentCall: () => ({ card: 'terminal', title: 'eden_zh_status' }),
  })

  ctx.tools.register({
    name: 'eden_zh_deploy',
    description:
      '把 Eden 简体中文汉化装到本机：复制 Eden.app 为「Eden（汉化）.app」，接管启动器注入中文化脚本，重新签名并部署词典。可选 app_path 指定 Eden.app 位置，省略则自动在 /Applications 与 ~/Applications 查找。约需 10 秒，过程中会退出正在运行的 Eden。',
    parameters: {
      app_path: {
        type: 'string',
        description: 'Eden.app 的绝对路径；留空自动查找。',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const appPath = typeof args?.app_path === 'string' ? args.app_path.trim() : ''
      const argv = appPath ? ['--app', appPath] : ['install']
      return report(await run(argv, { timeoutMs: 240000 }))
    },
    presentCall: () => ({ card: 'terminal', title: 'eden_zh_deploy' }),
  })

  ctx.tools.register({
    name: 'eden_zh_uninstall',
    description:
      '删除汉化版「Eden（汉化）.app」，原版 Eden.app 不受影响。',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() {
      return report(await run(['--uninstall']))
    },
    presentCall: () => ({ card: 'terminal', title: 'eden_zh_uninstall' }),
  })

  ctx.logger?.info?.('eden-zh-dsh: eden_zh_status / eden_zh_deploy / eden_zh_uninstall 已注册')
}
