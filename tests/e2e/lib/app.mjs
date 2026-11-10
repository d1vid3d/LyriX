import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Cdp, delay } from './cdp.mjs'

const require = createRequire(import.meta.url)
const electronPath = require('electron')

export const e2eRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const repoRoot = resolve(e2eRoot, '..', '..')
export const wrapperPath = join(e2eRoot, 'main.cjs')
export const fixturesRoot = join(e2eRoot, 'fixtures')

const runningApps = new Set()

export function fixturePath(...parts) {
  return join(fixturesRoot, ...parts)
}

/** Creates a throw-away directory under the OS temp dir. */
export async function makeTempRoot(label) {
  return fs.mkdtemp(join(tmpdir(), `lyrix-e2e-${label}-`))
}

export async function seedSettings(userDataDir, settings = {}) {
  await fs.mkdir(userDataDir, { recursive: true })
  const full = {
    lastFolder: null,
    volume: 1,
    lastView: 'albums',
    sortByView: {},
    lyricPreference: 'sidecar',
    translationEnabled: false,
    translationLanguage: null,
    shuffle: false,
    repeat: 'off',
    ...settings
  }
  await fs.writeFile(join(userDataDir, 'settings.json'), JSON.stringify(full, null, 2), 'utf8')
}

/** Copies a committed fixture tree into a writable temp location. */
export async function copyFixtureTree(name, destination) {
  await fs.cp(fixturePath(name), destination, { recursive: true })
}

/** Copies one file many times; used for the virtualization/rescan fixture without committing it. */
export async function copyRepeated(
  source,
  destinationDir,
  count,
  nameFor = (index) => `bulk-${String(index).padStart(3, '0')}.flac`
) {
  await fs.mkdir(destinationDir, { recursive: true })
  let next = 0
  const worker = async () => {
    while (true) {
      const index = next++
      if (index >= count) return
      await fs.copyFile(source, join(destinationDir, nameFor(index)))
    }
  }
  await Promise.all(Array.from({ length: 24 }, worker))
}

async function waitForDevToolsPort(userDataDir, child, { timeoutMs = 25_000 } = {}) {
  const portFile = join(userDataDir, 'DevToolsActivePort')
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Electron exited before DevTools was ready (code ${child.exitCode})`)
    }
    try {
      const raw = await fs.readFile(portFile, 'utf8')
      const port = Number.parseInt(raw.split(/\r?\n/)[0], 10)
      if (Number.isInteger(port) && port > 0) return port
    } catch {
      // Not written yet.
    }
    await delay(100)
  }
  throw new Error(`DevToolsActivePort did not appear in ${userDataDir}`)
}

async function waitForPageTarget(port, { timeoutMs = 25_000 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      const targets = await response.json()
      const page = targets.find(
        (target) =>
          target.type === 'page' &&
          target.webSocketDebuggerUrl &&
          /^(file|http):/.test(target.url ?? '')
      )
      if (page) return page.webSocketDebuggerUrl
    } catch {
      // DevTools HTTP endpoint not up yet.
    }
    await delay(100)
  }
  throw new Error(`DevTools endpoint on port ${port} did not expose a page target`)
}

export class ElectronApp {
  constructor({ child, cdp, userDataDir, tempRoot }) {
    this.child = child
    this.cdp = cdp
    this.userDataDir = userDataDir
    this.tempRoot = tempRoot
    this.logs = ''
    this.stopped = false
  }

  get running() {
    return !this.stopped && this.child.exitCode === null
  }

  async stop() {
    if (this.stopped) return
    this.stopped = true
    runningApps.delete(this)

    try {
      this.cdp.close()
    } catch {
      // Ignore close failures.
    }

    if (this.child.exitCode !== null) return

    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(this.child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      })
    } else {
      this.child.kill('SIGTERM')
    }

    await Promise.race([
      once(this.child, 'exit'),
      delay(3_000).then(() => {
        if (this.child.exitCode === null) {
          try {
            this.child.kill('SIGKILL')
          } catch {
            // Ignore.
          }
        }
      })
    ])
  }
}

function once(emitter, event) {
  return new Promise((resolve) => emitter.once(event, resolve))
}

/** Launches the built app with an isolated userData directory and a dynamic CDP port. */
export async function launchApp({ userDataDir, settings, env = {}, seed = true }) {
  if (seed) await seedSettings(userDataDir, settings)
  // Reusing a userData directory after a relaunch leaves the previous port behind. Remove it so
  // the wait below cannot connect to the dead first instance.
  await fs.rm(join(userDataDir, 'DevToolsActivePort'), { force: true }).catch(() => {})

  const child = spawn(
    electronPath,
    [
      wrapperPath,
      '--remote-debugging-port=0',
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      ...(process.platform === 'linux' ? ['--no-sandbox'] : [])
    ],
    {
      cwd: repoRoot,
      env: { ...process.env, LYRIX_E2E_USER_DATA: userDataDir, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    }
  )

  const app = new ElectronApp({
    child,
    cdp: null,
    userDataDir,
    tempRoot: dirname(userDataDir)
  })
  runningApps.add(app)

  child.stdout.on('data', (chunk) => {
    app.logs += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    app.logs += chunk.toString()
  })

  try {
    const port = await waitForDevToolsPort(userDataDir, child)
    const wsUrl = await waitForPageTarget(port)
    app.cdp = await Cdp.connect(wsUrl)
    await app.cdp.send('Runtime.enable')
    await app.cdp.send('Log.enable')
    await app.cdp.send('Page.enable')
    return app
  } catch (error) {
    app.logs += `\n[launch failure] ${error.stack ?? error.message}\n`
    await app.stop()
    throw error
  }
}

/** Stops any app left behind by an uncaught error. */
export async function stopAllApps() {
  await Promise.all([...runningApps].map((app) => app.stop().catch(() => {})))
}
