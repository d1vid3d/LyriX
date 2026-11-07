import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { delay } from '../lib/cdp.mjs'
import { clickAlbum, clickSelector, clickTrack, readState } from '../lib/dom.mjs'
import { copyRepeated } from '../lib/app.mjs'

/** Startup, album detail, transport wiring, back navigation, and volume persistence. */
export async function runStartup(ctx) {
  const { cdp, runner, userDataDir, musicDir } = ctx

  runner.step('full: startup and cached settings')
  await cdp.waitFor('albums rendered', `document.querySelectorAll('.album-card').length === 5`)
  let ui = await readState(cdp)
  runner.equal('window title', ui.title, 'LyriX')
  runner.equal('album cards', ui.albums.length, 5)
  runner.equal('status counts', ui.status, 'ui-music · 5 albums · 7 tracks')
  runner.equal('volume restored from settings', ui.volume, 0.35)
  runner.check('audio volume restored', Math.abs(ui.audioVolume - 0.35) < 1e-9, String(ui.audioVolume))
  runner.equal('rescan enabled after load', ui.rescanDisabled, false)

  const shared = ui.albums.filter((album) => album.title === 'Shared Album')
  runner.equal('shared album appears twice', shared.length, 2)
  runner.equal(
    'shared album artists',
    shared.map((album) => album.artist).sort(),
    ['Album Artist A', 'Album Artist B']
  )
  runner.equal(
    'album titles sorted',
    ui.albums.map((album) => album.title),
    ['Folder Cover Album', 'No Art Album', 'Shared Album', 'Shared Album', 'Unknown Album']
  )
  await cdp.waitFor(
    'grid cover loaded',
    `(() => { const img = document.querySelector('.album-card img'); return !!img && img.complete && img.naturalWidth > 0 })()`
  )
  ui = await readState(cdp)
  runner.check('grid cover loaded', ui.albums.some((album) => album.coverLoaded))

  runner.step('full: album detail')
  runner.check('album card found: Shared Album / Album Artist A', await clickAlbum(cdp, 'Shared Album', 'Album Artist A'))
  await cdp.waitFor('detail view', `document.querySelector('#detail-view').hidden === false`)
  await cdp.waitFor(
    'detail cover loaded',
    `(() => { const img = document.querySelector('#detail-cover'); return !!img && img.complete && img.naturalWidth > 0 })()`
  )
  ui = await readState(cdp)
  runner.equal('detail title', ui.detailTitle, 'Shared Album')
  runner.equal('detail artist', ui.detailArtist, 'Album Artist A')
  runner.equal('detail track count', ui.tracks.length, 2)
  runner.equal(
    'detail track order',
    ui.tracks.map((track) => ({ title: track.title, number: track.number, duration: track.duration })),
    [
      { title: 'First Song', number: '1', duration: '0:02' },
      { title: 'Second Song', number: '2', duration: '0:05' }
    ]
  )
  runner.check('detail cover loaded', ui.detailCoverLoaded)

  runner.step('full: playback wiring')
  await clickSelector(cdp, '#track-list .track')
  await cdp.waitFor(
    'audio playing',
    `(() => {
      const audio = document.querySelector('#audio')
      return !audio.paused && audio.currentTime > 0.2 && document.querySelector('#play-pause').dataset.playing === 'true'
    })()`
  )
  ui = await readState(cdp)
  runner.equal('now playing title', ui.nowTitle, 'First Song')
  runner.equal('now playing artist', ui.nowArtist, 'Artist One')
  runner.equal('one highlighted track', ui.tracks.filter((track) => track.playing).length, 1)
  runner.equal('highlighted track', ui.tracks.find((track) => track.playing)?.title, 'First Song')
  runner.equal('play button shows pause', ui.playLabel, 'Pause')
  runner.equal('next enabled mid-album', ui.nextDisabled, false)
  runner.equal('previous enabled with current track', ui.previousDisabled, false)
  runner.equal('seek enabled', ui.seek.disabled, false)
  runner.check('seek duration loaded', ui.seek.max >= 1.9 && ui.seek.max <= 2.1, String(ui.seek.max))
  await cdp.waitFor(
    'now cover loaded',
    `(() => { const img = document.querySelector('#now-cover'); return !!img && img.complete && img.naturalWidth > 0 })()`
  )
  ui = await readState(cdp)
  runner.check('now cover loaded', ui.nowCoverLoaded)

  await clickSelector(cdp, '#play-pause')
  await cdp.waitFor(
    'audio paused',
    `document.querySelector('#audio').paused === true && document.querySelector('#play-pause').dataset.playing === 'false'`
  )
  ui = await readState(cdp)
  runner.equal('play button shows play', ui.playLabel, 'Play')

  runner.step('full: back navigation')
  await clickSelector(cdp, '#back')
  await cdp.waitFor('grid restored', `document.querySelector('#detail-view').hidden === true`)
  ui = await readState(cdp)
  runner.equal('grid visible after back', ui.gridHidden, false)
  runner.equal('detail hidden after back', ui.detailHidden, true)

  runner.step('full: volume persistence')
  // The app saves UI state on navigation and volume on change. Give the navigation save a moment
  // so the atomic settings writes do not overlap (Windows rename is not concurrency-tolerant).
  await delay(300)
  await cdp.evaluate(`(() => {
    const slider = document.querySelector('#volume')
    slider.value = '0.42'
    slider.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await cdp.waitFor(
    'volume applied',
    `Math.abs(document.querySelector('#audio').volume - 0.42) < 1e-9`
  )

  let savedSettings = null
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await cdp.evaluate(`document.querySelector('#volume').dispatchEvent(new Event('change', { bubbles: true }))`)
    const settingsDeadline = Date.now() + 1200
    while (Date.now() < settingsDeadline) {
      try {
        savedSettings = JSON.parse(await fs.readFile(join(userDataDir, 'settings.json'), 'utf8'))
        if (savedSettings.volume === 0.42) break
      } catch {
        // Not written yet.
      }
      await delay(50)
    }
    if (savedSettings?.volume === 0.42) break
  }
  runner.equal('volume persisted to settings', savedSettings?.volume, 0.42)
  runner.equal('last folder persisted', savedSettings?.lastFolder, musicDir)
}

/** Rescan with 600 new files, progress reporting, and the versioned library cache. */
export async function runRescan(ctx) {
  const { cdp, runner, userDataDir, musicDir } = ctx

  runner.step('full: rescan with changed file set')
  await copyRepeated(join(musicDir, 'NoTags', 'Untagged.flac'), join(musicDir, 'Bulk'), 600)

  const rescanClicked = await cdp.evaluate(`(() => {
    const button = document.querySelector('#rescan')
    if (button.disabled) return false
    button.click()
    return true
  })()`)
  runner.check('rescan button clicked', rescanClicked)

  const progress = await cdp.waitFor(
    'scan progress visible',
    `(() => {
      const label = document.querySelector('#scan-progress')
      return !label.hidden && /^Scanning \\d+ \\/ 607$/.test(label.textContent) ? label.textContent : null
    })()`,
    { timeoutMs: 15000, intervalMs: 20 }
  )
  runner.check('scan progress shows counts', /^Scanning \d+ \/ 607$/.test(progress), progress)

  await cdp.waitFor(
    'rescan finished',
    `document.querySelector('#status').textContent.includes('607 tracks') && document.querySelector('#scan-progress').hidden === true`,
    { timeoutMs: 30000 }
  )
  const ui = await readState(cdp)
  runner.equal('albums after rescan', ui.albums.length, 5)
  runner.equal('rescan re-enabled', ui.rescanDisabled, false)
  runner.check('progress hidden after rescan', ui.progress.hidden)

  const cacheDeadline = Date.now() + 5000
  let cache = null
  while (Date.now() < cacheDeadline) {
    try {
      cache = JSON.parse(await fs.readFile(join(userDataDir, 'library-cache.json'), 'utf8'))
      if (Object.keys(cache.tracks ?? {}).length === 607) break
    } catch {
      // Not written yet.
    }
    await delay(50)
  }
  runner.equal('cache version', cache?.version, 1)
  runner.equal('cache folder', cache?.folder, musicDir)
  runner.equal('cache track count', Object.keys(cache?.tracks ?? {}).length, 607)
}
