import { spawn } from 'node:child_process'
import { join } from 'node:path'

/**
 * Development launcher.
 *
 * Why the sandbox workaround exists:
 * - On Windows, Electron started from an Electron-hosted terminal (for example the OpenCode
 *   desktop app's integrated terminal) can fail to initialize Chromium's sandbox. The process
 *   exits immediately with -2147483645 (0x80000003) before creating a window; even
 *   `electron --version` reproduces it. The packaged app launched from Explorer works, so this is
 *   a launch-environment limitation, not a LyriX build/runtime bug.
 * - ELECTRON_DISABLE_SANDBOX=1 bypasses the OS sandbox for this dev session only. Packaged builds,
 *   `npm run build`, and the E2E harness do not use this wrapper and keep Chromium's normal sandbox.
 * - If your terminal can initialize Electron's sandbox normally (e.g. a plain Windows Terminal),
 *   set LYRIX_KEEP_SANDBOX=1 to opt out of this workaround.
 *
 * This file is committed project tooling, not machine-local state. The machine-local dev profile is
 * <project>/.lyrix-dev, which is gitignored.
 */
const env = { ...process.env }
const keepSandbox = env.LYRIX_KEEP_SANDBOX === '1'
if (process.platform === 'win32' && !keepSandbox && env.ELECTRON_DISABLE_SANDBOX === undefined) {
  env.ELECTRON_DISABLE_SANDBOX = '1'
}

const binary = join(
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite'
)

const child = spawn(binary, ['dev'], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32'
})

console.log(
  `[dev] starting electron-vite (sandbox disabled: ${env.ELECTRON_DISABLE_SANDBOX === '1'})`
)

child.on('exit', (code, signal) => {
  console.log(`[dev] electron-vite exited (code=${String(code)}, signal=${String(signal)})`)
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})

child.on('error', (error) => {
  console.error('[dev] Could not start electron-vite', error)
  process.exit(1)
})
