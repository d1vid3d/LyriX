#!/usr/bin/env node
// Tier 1: the required end-to-end smoke flow. Fast, deterministic, and focused on the path a
// user actually takes: scan -> open album -> play -> read lyrics -> seek -> switch tracks ->
// open/close Now Playing -> preserve view state.
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { copyFixtureTree, launchApp, makeTempRoot, stopAllApps } from './lib/app.mjs'
import { delay } from './lib/cdp.mjs'
import {
  clickAlbum,
  clickSelector,
  clickTrack,
  clickView,
  NOW_PLAYING_STATE_EXPRESSION,
  pressKey,
  readNowPlaying,
  readState,
  setSearch
} from './lib/dom.mjs'
import { runSuite } from './lib/runner.mjs'

const EXPECTED_LINE_TEXT = 'First line of the song|Second line follows|Third line ends here'

async function main(runner, ctx) {
  const { cdp } = ctx

  runner.step('startup and scan')
  await cdp.waitFor('one album card', `document.querySelectorAll('#album-grid .album-card').length === 1`)
  let ui = await readState(cdp)
  runner.equal('window title', ui.title, 'LyriX')
  runner.equal('one library album', ui.albums.length, 1)
  runner.equal('album title', ui.albums[0]?.title, 'Lyric Album')
  runner.equal('album artist', ui.albums[0]?.artist, 'Lyric Artist')
  runner.check(
    'status counts after startup scan',
    /^music · 1 album · 20 tracks$/.test(ui.status),
    ui.status
  )
  runner.equal('rescan enabled', ui.rescanDisabled, false)

  runner.step('open album and start playback')
  const opened = await clickAlbum(cdp, 'Lyric Album', 'Lyric Artist')
  runner.check('album opened', opened)
  await cdp.waitFor('detail view', `document.querySelector('#detail-view').hidden === false`)
  const started = await clickTrack(cdp, 'Lyric Test')
  runner.check('line-lyrics track started', started)
  await cdp.waitFor(
    'line track playing',
    `document.querySelector('#now-title').textContent === 'Lyric Test' && !document.querySelector('#audio').paused`
  )
  ui = await readState(cdp)
  runner.equal('now playing title', ui.nowTitle, 'Lyric Test')
  runner.equal('now playing artist', ui.nowArtist, 'Lyric Artist')
  runner.equal('play button shows pause', ui.playing, 'true')
  runner.equal('one highlighted track', ui.tracks.filter((track) => track.playing).length, 1)

  runner.step('open Now Playing and read line-timed lyrics')
  const openedNowPlaying = await clickSelector(cdp, '#now-playing')
  runner.check('bottom bar opens Now Playing', openedNowPlaying)
  await cdp.waitFor('Now Playing visible', `document.querySelector('#now-playing-view').hidden === false`)
  await cdp.waitFor(
    'line lyric DOM',
    `document.querySelectorAll('#lyric-lines .lyric-line').length === 3`
  )

  let now = await readNowPlaying(cdp)
  runner.equal('Now Playing title', now.title, 'Lyric Test')
  runner.equal('Now Playing artist', now.artist, 'Lyric Artist')
  runner.equal('Now Playing album', now.album, 'Lyric Album')
  runner.check('Now Playing replaces the detail view', now.detailHidden)
  runner.check('line lyrics are ready', now.statusHidden && !now.scrollerHidden)
  runner.check(
    'line lyric text',
    now.lines.map((line) => line.text).join('|') === EXPECTED_LINE_TEXT,
    JSON.stringify(now.lines.map((line) => line.text))
  )
  runner.check('line data-index', now.lines.every((line, index) => line.index === String(index)))
  runner.check('line data-agent absent', now.lines.every((line) => line.agent === ''))

  runner.step('line timing and line seeking')
  await cdp.waitFor(
    'first line current',
    `(() => {
      const line = document.querySelector('#lyric-lines .lyric-line')
      return !!line && line.classList.contains('lyric-line--current') && line.classList.contains('lyric-line--active')
    })()`
  )
  now = await readNowPlaying(cdp)
  runner.check('first line is current', now.lines[0].current && now.lines[0].active)
  runner.check('later lines are upcoming', now.lines[1].upcoming && now.lines[2].upcoming)

  const pausedBeforeSeek = await cdp.evaluate(`document.querySelector('#audio').paused`)
  const seekClicked = await cdp.evaluate(`(() => {
    const line = document.querySelectorAll('#lyric-lines .lyric-line')[2]
    if (!line) return false
    line.click()
    return true
  })()`)
  runner.check('lyric line clicked', seekClicked)
  await cdp.waitFor('line click seeks', `document.querySelector('#audio').currentTime >= 3.9`)
  const pausedAfterSeek = await cdp.evaluate(`document.querySelector('#audio').paused`)
  runner.check('line click keeps play/pause state', pausedBeforeSeek === pausedAfterSeek)
  await cdp.waitFor(
    'third line current after seek',
    `document.querySelectorAll('#lyric-lines .lyric-line')[2].classList.contains('lyric-line--current')`
  )

  runner.step('close and reopen Now Playing')
  const closed = await clickSelector(cdp, '#now-playing-close')
  runner.check('close button clicked', closed)
  await cdp.waitFor('Now Playing closed', `document.querySelector('#now-playing-view').hidden === true`)
  now = await readNowPlaying(cdp)
  runner.check('close restores the detail view', !now.detailHidden)
  runner.equal('close keeps the selected view', now.activeView, 'albums')

  await clickSelector(cdp, '#now-playing')
  await cdp.waitFor('Now Playing reopened', `document.querySelector('#now-playing-view').hidden === false`)

  runner.step('live track change: word-timed lyrics')
  const nextToWord = await cdp.evaluate(`(() => {
    const button = document.querySelector('#next')
    if (!button || button.disabled) return false
    button.click()
    return true
  })()`)
  runner.check('next track while Now Playing is open', nextToWord)
  await cdp.waitFor('word track title', `document.querySelector('#now-playing-title').textContent === 'Word Test'`)
  await cdp.waitFor(
    'word lyric DOM',
    `document.querySelectorAll('#lyric-lines .lyric-line').length === 2`
  )

  now = await readNowPlaying(cdp)
  runner.equal('word line has 4 word containers', now.lines[0].words, 4)
  runner.equal('word line has 5 segments', now.lines[0].segments, 5)
  runner.equal('word line text', now.lines[0].text, 'To the uptight tempo')
  runner.check('word data-agent absent', now.lines.every((line) => line.agent === ''))

  await cdp.waitFor(
    'active segment progress',
    `(() => {
      const segment = document.querySelector('#lyric-lines .lyric-seg--active')
      return !!segment && segment.style.getPropertyValue('--progress') !== ''
    })()`
  )
  now = await readNowPlaying(cdp)
  runner.check(
    'word active segment has progress',
    now.lines[0].activeSegments === 1 && now.lines[0].activeProgress !== '',
    JSON.stringify(now.lines[0])
  )

  runner.step('plain lyrics stay static')
  const nextToPlain = await cdp.evaluate(`(() => {
    const button = document.querySelector('#next')
    if (!button || button.disabled) return false
    button.click()
    return true
  })()`)
  runner.check('next to plain track', nextToPlain)
  await cdp.waitFor('plain title', `document.querySelector('#now-playing-title').textContent === 'Plain Test'`)
  await cdp.waitFor(
    'plain lyric DOM',
    `document.querySelectorAll('#lyric-lines .lyric-line').length === 3`
  )
  await cdp.waitFor(
    'plain static class',
    `document.querySelector('#lyric-lines').classList.contains('lyric-lines--static')`
  )
  await delay(600)
  now = await readNowPlaying(cdp)
  runner.check('plain lyrics are static', now.staticLines)
  runner.check('plain lyrics have no current line', now.lines.every((line) => !line.current && !line.active))

  const paused = await cdp.evaluate(`(() => {
    const audio = document.querySelector('#audio')
    if (!audio.paused) document.querySelector('#play-pause').click()
    return audio.paused
  })()`)
  runner.check('paused before plain line click', paused)
  const plainTimeBefore = await cdp.evaluate(`document.querySelector('#audio').currentTime`)
  await cdp.evaluate(`document.querySelectorAll('#lyric-lines .lyric-line')[0].click()`)
  await delay(250)
  const plainTimeAfter = await cdp.evaluate(`document.querySelector('#audio').currentTime`)
  runner.check(
    'plain line click does not seek',
    Math.abs(plainTimeAfter - plainTimeBefore) < 0.1,
    `before=${plainTimeBefore} after=${plainTimeAfter}`
  )

  runner.step('missing lyrics show the expected sidecar hint')
  const nextToMissing = await cdp.evaluate(`(() => {
    const button = document.querySelector('#next')
    if (!button || button.disabled) return false
    button.click()
    return true
  })()`)
  runner.check('next to no-lyrics track', nextToMissing)
  await cdp.waitFor('no-lyrics title', `document.querySelector('#now-playing-title').textContent === 'No Lyrics'`)
  await cdp.waitFor(
    'no lyrics status',
    `(() => {
      const status = document.querySelector('#lyrics-status')
      return status.hidden === false && status.textContent.includes('No lyrics found')
    })()`
  )
  now = await readNowPlaying(cdp)
  runner.check(
    'missing lyrics name the expected sidecar',
    now.statusText.includes('"04 - No Lyrics.lrc"'),
    now.statusText
  )
  runner.check('missing lyrics hide the scroller', now.scrollerHidden)

  runner.step('Escape closes Now Playing')
  await pressKey(cdp, 'Escape')
  await cdp.waitFor('Escape closes Now Playing', `document.querySelector('#now-playing-view').hidden === true`)

  runner.step('tracks view, search, and scroll survive Now Playing')
  const tracksViewClicked = await clickView(cdp, 'tracks')
  runner.check('tracks view clicked', tracksViewClicked)
  await cdp.waitFor('tracks view rows', `document.querySelectorAll('#track-scroll .track-row').length > 10`)

  await setSearch(cdp, 'Plain')
  await cdp.waitFor('search filtered', `document.querySelectorAll('#track-scroll .track-row').length === 1`)
  ui = await readState(cdp)
  runner.equal('search finds the plain track', ui.trackRows[0]?.title, 'Plain Test')

  await setSearch(cdp, '')
  await cdp.waitFor('search cleared', `document.querySelectorAll('#track-scroll .track-row').length > 10`)
  await cdp.evaluate(
    `document.querySelector('#track-scroll').scrollTop = document.querySelector('#track-scroll').scrollHeight`
  )
  await cdp.waitFor(
    'track list scrolled to the final row',
    `[...document.querySelectorAll('#track-scroll .track-row')].some(
      (row) => row.querySelector('.track-row-title')?.textContent === 'Word Test'
    )`
  )
  const scrollBefore = await cdp.evaluate(`document.querySelector('#track-scroll').scrollTop`)
  runner.check('tracks view actually scrolled', scrollBefore > 0, String(scrollBefore))

  await clickSelector(cdp, '#now-playing')
  await cdp.waitFor('Now Playing from tracks view', `document.querySelector('#now-playing-view').hidden === false`)
  await clickSelector(cdp, '#now-playing-close')
  await cdp.waitFor('Now Playing closed to tracks', `document.querySelector('#now-playing-view').hidden === true`)
  // Closing re-shows the preserved tracks view; its virtual row window is laid out on the next
  // frame, so wait for it before snapshotting or the row count is transiently zero.
  await cdp.waitFor(
    'tracks row window restored',
    `document.querySelectorAll('#track-scroll .track-row').length > 10`
  )

  now = await readNowPlaying(cdp)
  runner.equal('close keeps the search text', now.search, '')
  runner.check('close keeps the tracks view', now.activeView === 'tracks' && !now.tracksHidden)
  runner.check('close does not reset the row window', now.trackRows > 10, String(now.trackRows))
  runner.check(
    'close keeps the scroll position',
    Math.abs(now.trackScrollTop - scrollBefore) < 2,
    `before=${scrollBefore} after=${now.trackScrollTop}`
  )

  runner.step('renderer stayed clean')
  runner.check('no renderer exceptions', cdp.exceptions.length === 0, cdp.exceptions.join(' | '))
  runner.check('no console errors', cdp.consoleErrors.length === 0, cdp.consoleErrors.join(' | '))
  runner.check('no browser log errors', cdp.logErrors.length === 0, cdp.logErrors.join(' | '))
  runner.check('app is still running', ctx.app.running)
  if (process.env.LYRIX_E2E_VERBOSE === '1') {
    console.log('--- app log ---')
    console.log(ctx.app.logs)
  }
}

async function run() {
  const tempRoot = await makeTempRoot('smoke')
  const musicDir = join(tempRoot, 'music')
  const userDataDir = join(tempRoot, 'userData')
  let ctx = { app: null, cdp: null, tempRoot }
  let app = null

  try {
    await copyFixtureTree('lyrics', musicDir)
    app = await launchApp({
      userDataDir,
      settings: { lastFolder: musicDir, volume: 0.5 }
    })
    ctx = { app, cdp: app.cdp, tempRoot }

    const failures = await runSuite({
      title: 'E2E smoke',
      main: (runner) => main(runner, ctx),
      app,
      cdp: app.cdp,
      tempRoot,
      stateExpression: NOW_PLAYING_STATE_EXPRESSION,
      stopAll: stopAllApps
    })
    process.exitCode = failures === 0 ? 0 : 1
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    await stopAllApps()
    if (process.exitCode !== 0 && process.exitCode !== undefined) {
      // Keep the temp directory for diagnosis; runSuite already prints the path.
      console.error(`Temp directory: ${tempRoot}`)
    } else if (!process.env.LYRIX_E2E_KEEP) {
      await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {})
    }
  }
}

run()
