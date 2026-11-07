#!/usr/bin/env node
// Tier 2: the ported legacy regression suite. Opt-in, slower, and broader than smoke.mjs.
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { copyFixtureTree, launchApp, makeTempRoot, stopAllApps } from '../lib/app.mjs'
import { LIBRARY_STATE_EXPRESSION } from '../lib/dom.mjs'
import { runSuite } from '../lib/runner.mjs'
import { runStartup, runRescan } from './library.mjs'
import * as playback from './playback.mjs'
import * as views from './views.mjs'

async function run() {
  const tempRoot = await makeTempRoot('full')
  const musicDir = join(tempRoot, 'ui-music')
  const userDataDir = join(tempRoot, 'userData')
  const ctx = { tempRoot, musicDir, userDataDir, runner: null, app: null, cdp: null }
  let session = { consoleErrors: [], exceptions: [] }

  try {
    await copyFixtureTree('library', musicDir)
    ctx.app = await launchApp({
      userDataDir,
      settings: { lastFolder: musicDir, volume: 0.35 }
    })
    ctx.cdp = ctx.app.cdp

    const failures = await runSuite({
      title: 'E2E full',
      main: async (runner) => {
        ctx.runner = runner

        await runStartup(ctx)
        await playback.run(ctx)
        await runRescan(ctx)

        // The failure-path test intentionally logs one renderer error. Keep it observable but
        // scoped, and remember this session's messages across the relaunch below.
        session = {
          consoleErrors: [...ctx.cdp.consoleErrors],
          exceptions: [...ctx.cdp.exceptions]
        }

        await ctx.app.stop()
        ctx.app = await launchApp({ userDataDir, seed: false })
        ctx.cdp = ctx.app.cdp

        await views.run(ctx)

        runner.step('full: renderer health')
        const consoleErrors = [...session.consoleErrors, ...ctx.cdp.consoleErrors]
        const exceptions = [...session.exceptions, ...ctx.cdp.exceptions]
        const unexpected = consoleErrors.filter((message) => !message.includes('Could not play broken'))
        runner.check('no unexpected renderer console errors', unexpected.length === 0, unexpected.join(' | '))
        runner.check('no renderer exceptions', exceptions.length === 0, exceptions.join(' | '))
        runner.check('app is still running', ctx.app.running)
      },
      app: ctx.app,
      cdp: ctx.cdp,
      tempRoot,
      stateExpression: LIBRARY_STATE_EXPRESSION,
      getTargets: () => ({ app: ctx.app, cdp: ctx.cdp }),
      stopAll: stopAllApps
    })

    process.exitCode = failures === 0 ? 0 : 1
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    await stopAllApps()
    if (process.exitCode && !process.env.LYRIX_E2E_KEEP) {
      console.error(`Temp directory: ${tempRoot}`)
    } else if (!process.env.LYRIX_E2E_KEEP) {
      await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {})
    }
  }
}

run()
