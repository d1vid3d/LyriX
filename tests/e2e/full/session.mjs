import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { launchApp } from '../lib/app.mjs'
import { delay } from '../lib/cdp.mjs'
import { clickAlbum, clickSelector, clickTrack, clickView } from '../lib/dom.mjs'

const SAVED_POSITION = 1

async function waitForSessionFiles(userDataDir, timeoutMs = 6000) {
  const queueFile = join(userDataDir, 'session-queue.json')
  const positionFile = join(userDataDir, 'session-position.json')
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      const queue = JSON.parse(await fs.readFile(queueFile, 'utf8'))
      const position = JSON.parse(await fs.readFile(positionFile, 'utf8'))
      if (queue?.queue?.entries?.length > 0 && position?.position?.position > 0) return true
    } catch {
      // Not written yet.
    }
    await delay(100)
  }

  return false
}

/** Tier 2: queue/position are saved, then restored paused after a real process restart. */
export async function run(ctx) {
  const { runner, userDataDir } = ctx
  let { cdp } = ctx

  runner.step('full: session resume')
  await clickView(cdp, 'albums')
  const albumOpened = await clickAlbum(cdp, 'Shared Album', 'Album Artist A')
  runner.check('session album opened', albumOpened)
  const trackStarted = await clickTrack(cdp, 'First Song')
  runner.check('session track started', trackStarted)
  await cdp.waitFor(
    'session track playing',
    `document.querySelector('#now-title').textContent === 'First Song' &&
      document.querySelector('#play-pause').dataset.playing === 'true'`
  )

  await new Promise((resolve) => setTimeout(resolve, 1200))
  await cdp.evaluate(`(() => {
    const seek = document.querySelector('#seek')
    seek.value = '${SAVED_POSITION}'
    seek.dispatchEvent(new Event('input', { bubbles: true }))
    seek.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await clickSelector(cdp, '#play-pause')
  await cdp.waitFor(
    'session paused after seeking',
    `document.querySelector('#play-pause').dataset.playing === 'false'`
  )
  await new Promise((resolve) => setTimeout(resolve, 1200))

  const sessionFiles = await waitForSessionFiles(userDataDir)
  runner.check('session files capture the queue and position', sessionFiles)

  await ctx.app.stop()
  ctx.app = await launchApp({ userDataDir, seed: false })
  cdp = ctx.app.cdp
  ctx.cdp = cdp

  await cdp.waitFor(
    'restored library rendered',
    `document.querySelectorAll('#album-grid .album-card').length === 5`,
    { timeoutMs: 20000 }
  )
  await cdp.waitFor(
    'restored track is shown paused',
    `document.querySelector('#now-title').textContent === 'First Song' &&
      document.querySelector('#play-pause').dataset.playing === 'false'`
  )
  await cdp.waitFor(
    'restored track metadata loaded',
    `Number(document.querySelector('#seek').max) > 0`
  )
  await cdp.waitFor(
    'restored position applied',
    `Number(document.querySelector('#seek').value) > 0`
  )

  const restored = await cdp.evaluate(`(() => {
    const seek = document.querySelector('#seek')
    return {
      position: Number(seek.value),
      duration: Number(seek.max),
      title: document.querySelector('#now-title').textContent
    }
  })()`)
  runner.equal('resume shows the saved track', restored.title, 'First Song')
  runner.check(
    'resume seeks to the saved position',
    restored.duration > 0 && Math.abs(restored.position - SAVED_POSITION) < 0.6,
    JSON.stringify(restored)
  )

  await clickSelector(cdp, '#queue-toggle')
  await cdp.waitFor(
    'restored queue panel visible',
    `document.querySelector('#queue-panel').hidden === false`
  )
  const queue = await cdp.evaluate(`(() => ({
    context: document.querySelector('#queue-context').textContent,
    current: document.querySelector('#queue-scroll .queue-entry--current .queue-entry-title')?.textContent ?? ''
  }))()`)
  runner.equal('resume restores the queue context', queue.context, 'Album · Shared Album')
  runner.equal('resume restores the current queue entry', queue.current, 'First Song')

  const autoplay = await cdp.evaluate(`document.querySelector('#play-pause').dataset.playing`)
  runner.equal('resume never autoplays', autoplay, 'false')
}
