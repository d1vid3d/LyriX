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
  clickMenuItem,
  clickSelector,
  clickTrack,
  clickView,
  NOW_PLAYING_STATE_EXPRESSION,
  pressKey,
  readNowPlaying,
  readState,
  rightClickSelector,
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
  const albumActions = await cdp.evaluate(`(() => {
    const play = document.querySelector('#album-play')
    const shuffle = document.querySelector('#album-shuffle')
    return {
      playText: play?.textContent.trim() ?? '',
      playLabel: play?.getAttribute('aria-label') ?? '',
      shuffleText: shuffle?.textContent.trim() ?? '',
      shuffleLabel: shuffle?.getAttribute('aria-label') ?? ''
    }
  })()`)
  runner.check(
    'album header exposes Play and Shuffle',
    albumActions.playText === 'Play' &&
      albumActions.playLabel === 'Play album' &&
      albumActions.shuffleText === 'Shuffle' &&
      albumActions.shuffleLabel === 'Shuffle album',
    JSON.stringify(albumActions)
  )
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

  runner.step('shuffle and repeat controls')
  runner.equal('shuffle starts off', ui.shufflePressed, 'false')
  runner.equal('shuffle starts with an off label', ui.shuffleLabel, 'Shuffle: off')
  runner.equal('repeat starts off', ui.repeatPressed, 'false')
  runner.equal('repeat starts with an off label', ui.repeatLabel, 'Repeat: off')

  await clickSelector(cdp, '#shuffle')
  await cdp.waitFor('shuffle on', `document.querySelector('#shuffle').getAttribute('aria-pressed') === 'true'`)
  ui = await readState(cdp)
  runner.equal('shuffle label turns on', ui.shuffleLabel, 'Shuffle: on')

  await clickSelector(cdp, '#repeat')
  await cdp.waitFor('repeat all', `document.querySelector('#repeat').dataset.repeat === 'all'`)
  ui = await readState(cdp)
  runner.equal('repeat label shows all', ui.repeatLabel, 'Repeat: all')

  await clickSelector(cdp, '#repeat')
  await cdp.waitFor('repeat one', `document.querySelector('#repeat').dataset.repeat === 'one'`)
  ui = await readState(cdp)
  runner.equal('repeat label shows one', ui.repeatLabel, 'Repeat: one')
  runner.check('repeat one shows its badge', ui.repeatBadgeVisible)

  await clickSelector(cdp, '#repeat')
  await cdp.waitFor('repeat off again', `document.querySelector('#repeat').dataset.repeat === 'off'`)
  await clickSelector(cdp, '#shuffle')
  await cdp.waitFor('shuffle off again', `document.querySelector('#shuffle').getAttribute('aria-pressed') === 'false'`)
  ui = await readState(cdp)
  runner.equal('repeat returns to off', ui.repeatLabel, 'Repeat: off')
  runner.equal('shuffle returns to off', ui.shuffleLabel, 'Shuffle: off')

  runner.step('queue panel and context menu')
  const queueOpened = await clickSelector(cdp, '#queue-toggle')
  runner.check('queue toggle opens the panel', queueOpened)
  await cdp.waitFor(
    'queue panel visible',
    `document.querySelector('#queue-panel').hidden === false`
  )

  let queue = await cdp.evaluate(`(() => {
    const toggle = document.querySelector('#queue-toggle')
    const current = document.querySelector('#queue-scroll .queue-entry--current')
    const spacer = document.querySelector('#queue-scroll .virtual-list-spacer')
    return {
      pressed: toggle?.getAttribute('aria-pressed') ?? '',
      expanded: toggle?.getAttribute('aria-expanded') ?? '',
      context: document.querySelector('#queue-context')?.textContent ?? '',
      summary: document.querySelector('#queue-summary')?.textContent ?? '',
      currentTitle: current?.querySelector('.queue-entry-title')?.textContent ?? '',
      currentArtist: current?.querySelector('.queue-entry-artist')?.textContent ?? '',
      hasNextUp: [...document.querySelectorAll('#queue-scroll .queue-section-label')].some(
        (label) => label.textContent === 'Next up'
      ),
      clearDisabled: document.querySelector('#queue-clear')?.disabled ?? true,
      spacerHeight: spacer ? parseFloat(spacer.style.height) : 0
    }
  })()`)
  runner.check(
    'queue toggle reflects the open panel',
    queue.pressed === 'true' && queue.expanded === 'true',
    JSON.stringify(queue)
  )
  runner.equal('queue header shows the album context', queue.context, 'Album · Lyric Album')
  runner.check(
    'queue summary counts and times the queue',
    /^20 tracks · \d+:\d{2}$/.test(queue.summary),
    queue.summary
  )
  runner.check(
    'queue shows the current row',
    queue.currentTitle === 'Lyric Test' && queue.currentArtist === 'Lyric Artist',
    JSON.stringify(queue)
  )
  runner.check('queue renders the Next up section', queue.hasNextUp)
  runner.equal('clear is enabled with upcoming tracks', queue.clearDisabled, false)
  // 20 entries plus the Now playing and Next up headers, all at the shared 56px row height.
  runner.equal('queue spacer covers every row and header', queue.spacerHeight, 22 * 56)

  const queueMenuOpened = await rightClickSelector(cdp, '#queue-scroll .queue-entry--current')
  runner.check('queue row opens a context menu', queueMenuOpened)
  await cdp.waitFor(
    'queue row menu visible',
    `document.querySelector('.context-menu').hidden === false`
  )
  const queueMenu = await cdp.evaluate(`(() => {
    const menu = document.querySelector('.context-menu')
    const items = [...menu.querySelectorAll('[data-menu-item]')]
    return {
      role: menu.getAttribute('role') ?? '',
      labels: items.map((item) => item.querySelector('.context-menu__label')?.textContent ?? ''),
      disabled: items.map((item) => item.disabled),
      focused: document.activeElement?.querySelector('.context-menu__label')?.textContent ?? ''
    }
  })()`)
  runner.equal('context menu exposes the menu role', queueMenu.role, 'menu')
  runner.equal(
    'queue row menu lists every row action',
    queueMenu.labels.join('|'),
    'Play now|Play next|Move to top of Next up|Move to bottom|Remove|Add to Favorites|Go to album|Go to artist|Show in file manager'
  )
  runner.check(
    'current queue row disables move and remove actions',
    !queueMenu.disabled[0] &&
      queueMenu.disabled[1] &&
      queueMenu.disabled[2] &&
      queueMenu.disabled[3] &&
      queueMenu.disabled[4],
    JSON.stringify(queueMenu.disabled)
  )
  runner.equal('context menu focuses its first item', queueMenu.focused, 'Play now')

  await pressKey(cdp, 'Escape')
  await cdp.waitFor(
    'Escape closes the context menu',
    `document.querySelector('.context-menu').hidden === true`
  )
  const panelSurvivedMenu = await cdp.evaluate(
    `document.querySelector('#queue-panel').hidden === false`
  )
  runner.check('Escape closes the menu before the queue panel', panelSurvivedMenu)

  runner.step('fluid queue drag reorder')
  const dragStart = await cdp.evaluate(`(() => {
    const upcoming = [...document.querySelectorAll('#queue-scroll .queue-entry')].filter(
      (row) =>
        !row.classList.contains('queue-entry--current') &&
        !row.classList.contains('queue-entry--history')
    )
    const titles = upcoming.map(
      (row) => row.querySelector('.queue-entry-title')?.textContent ?? ''
    )
    const source = upcoming[2]
    const handle = source?.querySelector('.queue-drag-handle')
    if (!source || !handle) return null

    const rect = handle.getBoundingClientRect()
    const x = Math.round(rect.left + rect.width / 2)
    const y = Math.round(rect.top + rect.height / 2)
    handle.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: x,
        clientY: y
      })
    )
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        isPrimary: true,
        buttons: 1,
        clientX: x,
        clientY: y + 56
      })
    )
    return { titles, sourceTitle: titles[2] }
  })()`)
  runner.check('drag starts from a Next up handle', dragStart !== null)

  await cdp.waitFor(
    'drag ghost follows the pointer',
    `document.querySelectorAll('.queue-drag-ghost').length === 1`
  )
  const dragVisuals = await cdp.evaluate(`(() => {
    const ghost = document.querySelector('.queue-drag-ghost')
    const shifted = [...document.querySelectorAll('#queue-scroll .queue-entry--shifted')]
    return {
      ghostTitle: ghost?.querySelector('.queue-entry-title')?.textContent ?? '',
      ghostHidden: ghost?.getAttribute('aria-hidden') ?? '',
      hasSource: !!document.querySelector('#queue-scroll .queue-entry--source'),
      shiftedCount: shifted.length,
      shiftTransform: shifted[0] ? getComputedStyle(shifted[0]).transform : ''
    }
  })()`)
  runner.equal(
    'drag ghost mirrors the dragged row',
    dragVisuals.ghostTitle,
    dragStart?.sourceTitle
  )
  runner.equal('drag ghost is decorative', dragVisuals.ghostHidden, 'true')
  runner.check('dragged row leaves its slot', dragVisuals.hasSource)
  runner.check(
    'neighbouring row makes way with a transform',
    dragVisuals.shiftedCount >= 1 && dragVisuals.shiftTransform !== 'none',
    JSON.stringify(dragVisuals)
  )

  await cdp.evaluate(
    `window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }))`
  )
  await cdp.waitFor(
    'drag ghost is removed',
    `document.querySelectorAll('.queue-drag-ghost').length === 0`
  )
  const dragResult = await cdp.evaluate(`(() => {
    const upcoming = [...document.querySelectorAll('#queue-scroll .queue-entry')].filter(
      (row) =>
        !row.classList.contains('queue-entry--current') &&
        !row.classList.contains('queue-entry--history')
    )
    return {
      titles: upcoming.map(
        (row) => row.querySelector('.queue-entry-title')?.textContent ?? ''
      ),
      leftovers:
        document.querySelectorAll('#queue-scroll .queue-entry--shifted').length +
        document.querySelectorAll('#queue-scroll .queue-entry--source').length
    }
  })()`)
  runner.check(
    'dropping commits the one-slot move',
    dragResult.titles[2] === dragStart?.titles[3] &&
      dragResult.titles[3] === dragStart?.titles[2],
    JSON.stringify({ before: dragStart?.titles, after: dragResult.titles })
  )
  runner.equal('drag classes are cleared after the drop', dragResult.leftovers, 0)

  await pressKey(cdp, 'Escape')
  await cdp.waitFor(
    'Escape closes the queue panel',
    `document.querySelector('#queue-panel').hidden === true`
  )
  queue = await cdp.evaluate(`(() => {
    const toggle = document.querySelector('#queue-toggle')
    return {
      pressed: toggle?.getAttribute('aria-pressed') ?? '',
      expanded: toggle?.getAttribute('aria-expanded') ?? ''
    }
  })()`)
  runner.check(
    'queue toggle clears the open state',
    queue.pressed === 'false' && queue.expanded === 'false',
    JSON.stringify(queue)
  )

  await pressKey(cdp, 'q')
  await cdp.waitFor(
    'Q opens the queue panel',
    `document.querySelector('#queue-panel').hidden === false`
  )
  const qOpened = await cdp.evaluate(`document.querySelector('#queue-toggle').getAttribute('aria-pressed') === 'true'`)
  runner.check('Q toggles the queue panel open', qOpened)
  await pressKey(cdp, 'q')
  await cdp.waitFor(
    'Q closes the queue panel',
    `document.querySelector('#queue-panel').hidden === true`
  )

  const trackMenuOpened = await rightClickSelector(cdp, '#track-list .track')
  runner.check('album track row opens a context menu', trackMenuOpened)
  await cdp.waitFor(
    'album track menu visible',
    `document.querySelector('.context-menu').hidden === false`
  )
  const trackMenuLabels = await cdp.evaluate(
    `[...document.querySelectorAll('.context-menu [data-menu-item]')].map(
      (item) => item.querySelector('.context-menu__label')?.textContent ?? ''
    )`
  )
  runner.check(
    'track menu offers playback, navigation, and reveal',
    trackMenuLabels.join('|') ===
      'Play|Play next|Add to queue|Add to Favorites|Go to album|Go to artist|Show in file manager',
    trackMenuLabels.join('|')
  )
  await pressKey(cdp, 'Escape')
  await cdp.waitFor(
    'album track menu closed',
    `document.querySelector('.context-menu').hidden === true`
  )

  runner.step('album card menu navigation')
  await clickSelector(cdp, '#back')
  await cdp.waitFor(
    'back to the album grid',
    `document.querySelector('#grid-view').hidden === false &&
      document.querySelectorAll('#album-grid .album-card').length === 1`
  )
  const albumMenuOpened = await rightClickSelector(cdp, '#album-grid .album-card')
  runner.check('album card opens a context menu', albumMenuOpened)
  await cdp.waitFor(
    'album card menu visible',
    `document.querySelector('.context-menu').hidden === false`
  )
  const albumMenuLabels = await cdp.evaluate(
    `[...document.querySelectorAll('.context-menu [data-menu-item]')].map(
      (item) => item.querySelector('.context-menu__label')?.textContent ?? ''
    )`
  )
  runner.check(
    'album menu offers queue, navigation, and reveal actions',
    albumMenuLabels.join('|') ===
      'Play|Shuffle|Play next (20 tracks)|Add to queue (20 tracks)|Go to artist|Show in file manager',
    albumMenuLabels.join('|')
  )

  const goToArtistClicked = await clickMenuItem(cdp, 'Go to artist')
  runner.check('album menu Go to artist runs', goToArtistClicked)
  await cdp.waitFor(
    'artist detail opens from the album menu',
    `document.querySelector('#artist-detail-view').hidden === false &&
      document.querySelector('#artist-name').textContent === 'Lyric Artist'`
  )

  await clickSelector(cdp, '#artist-back')
  await cdp.waitFor(
    'artist back returns to the album grid',
    `document.querySelector('#grid-view').hidden === false`
  )
  const albumReopened = await clickAlbum(cdp, 'Lyric Album', 'Lyric Artist')
  runner.check('album reopened after menu navigation', albumReopened)
  await cdp.waitFor('detail view after reopen', `document.querySelector('#detail-view').hidden === false`)

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

  runner.step('favorites and LyrixData')
  const musicRoot = join(ctx.tempRoot, 'music')
  const rootsBefore = await fs.readdir(musicRoot).catch(() => [])
  runner.check(
    'browsing never creates LyrixData',
    !rootsBefore.some((name) => name.toLowerCase() === 'lyrixdata'),
    rootsBefore.join(',')
  )

  await clickView(cdp, 'favorites')
  await cdp.waitFor(
    'favorites view opens before any write',
    `document.querySelector('#favorites-view').hidden === false`
  )
  const notCreated = await cdp.evaluate(`(() => ({
    status: document.querySelector('#favorites-status')?.textContent ?? '',
    emptyHidden: document.querySelector('#favorites-empty')?.hidden ?? true
  }))()`)
  runner.equal(
    'favorites not-created status is exact',
    notCreated.status,
    'Not created yet. It will be created when you add your first favorite.'
  )
  runner.check('favorites empty state is visible', !notCreated.emptyHidden)

  await clickView(cdp, 'tracks')
  await cdp.waitFor(
    'tracks view returns for favoriting',
    `document.querySelector('#tracks-view').hidden === false &&
      document.querySelectorAll('#track-scroll .track-row-wrap').length > 0`
  )

  const favoriteClicked = await cdp.evaluate(`(() => {
    const button = document.querySelector('#track-scroll .track-row-wrap [data-favorite-track-id]')
    if (!button) return ''
    const title = button.closest('.track-row-wrap')?.querySelector('.track-row-title')?.textContent ?? ''
    button.click()
    return title
  })()`)
  runner.check('track row heart starts a favorite', favoriteClicked !== '', favoriteClicked)
  await cdp.waitFor(
    'favorite heart turns on',
    `document.querySelector('#track-scroll .track-row-wrap [data-favorite-track-id]')?.getAttribute('aria-pressed') === 'true'`
  )
  const favoritesFile = join(musicRoot, 'LyrixData', 'favorites.json')
  const libraryFile = join(musicRoot, 'LyrixData', 'library.json')
  const readmeFile = join(musicRoot, 'LyrixData', 'README.txt')
  const createdDeadline = Date.now() + 5000
  let created = [false, false, false]
  while (Date.now() < createdDeadline) {
    created = await Promise.all([
      fs.stat(favoritesFile).then(() => true).catch(() => false),
      fs.stat(libraryFile).then(() => true).catch(() => false),
      fs.stat(readmeFile).then(() => true).catch(() => false)
    ])
    if (created.every(Boolean)) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  runner.check(
    'first write creates README, library.json, and favorites.json',
    created.every(Boolean),
    JSON.stringify({ favorites: created[0], library: created[1], readme: created[2] })
  )

  await clickView(cdp, 'favorites')
  await cdp.waitFor(
    'favorites view visible',
    `document.querySelector('#favorites-view').hidden === false`
  )
  const favoritesView = await cdp.evaluate(`(() => ({
    title: document.querySelector('#favorites-scroll .track-row-title')?.textContent ?? '',
    status: document.querySelector('#favorites-status')?.textContent ?? '',
    playDisabled: document.querySelector('#favorites-play')?.disabled ?? true,
    askKeys: document.querySelector('#sort-select')?.options[0]?.value ?? ''
  }))()`)
  runner.equal('favorites view lists the added track', favoritesView.title, favoriteClicked)
  runner.equal(
    'favorites status reports the LyrixData folder',
    favoritesView.status,
    "Saved in this library's LyrixData folder"
  )
  runner.equal('favorites Play is enabled', favoritesView.playDisabled, false)
  runner.equal('favorites default sort is Recently added', favoritesView.askKeys, 'recent')

  const favoriteRemoved = await cdp.evaluate(`(() => {
    const button = document.querySelector('#favorites-scroll [data-favorite-track-id]')
    if (!button) return false
    button.click()
    return true
  })()`)
  runner.check('favorites row heart removes the favorite', favoriteRemoved)
  await cdp.waitFor(
    'favorites empty state returns',
    `document.querySelector('#favorites-empty').hidden === false`
  )
  const emptyText = await cdp.evaluate(
    `document.querySelector('#favorites-empty').textContent`
  )
  runner.equal('favorites empty state is exact', emptyText, 'No favorites yet. Press the heart on any track.')

  await pressKey(cdp, 'f')
  await cdp.waitFor(
    'F favors the current track from the player bar heart',
    `document.querySelector('#favorite-current-host [data-favorite-track-id]')?.getAttribute('aria-pressed') === 'true'`
  )
  await cdp.waitFor(
    'favorite toast confirms the add',
    `document.querySelector('#toast-region')?.textContent === 'Added to Favorites'`
  )
  await pressKey(cdp, 'f')
  await cdp.waitFor(
    'F removes the current favorite again',
    `document.querySelector('#favorite-current-host [data-favorite-track-id]')?.getAttribute('aria-pressed') === 'false'`
  )

  await pressKey(cdp, 'q')
  await cdp.waitFor(
    'queue panel opens for favorite check',
    `document.querySelector('#queue-panel').hidden === false`
  )
  const queueHearts = await cdp.evaluate(
    `document.querySelectorAll('#queue-scroll .queue-entry [data-favorite-track-id]').length`
  )
  runner.check('queue rows expose favorite hearts', queueHearts > 0, String(queueHearts))
  await pressKey(cdp, 'Escape')

  runner.step('keyboard shortcut registry, overlay, and Escape layers')
  const shuffleBefore = await cdp.evaluate(
    `document.querySelector('#shuffle').getAttribute('aria-pressed')`
  )
  await pressKey(cdp, 's')
  await cdp.waitFor(
    'S toggles shuffle',
    `document.querySelector('#shuffle').getAttribute('aria-pressed') !== ${JSON.stringify(shuffleBefore)}`
  )
  await pressKey(cdp, 's')
  await cdp.waitFor(
    'S toggles shuffle back',
    `document.querySelector('#shuffle').getAttribute('aria-pressed') === ${JSON.stringify(shuffleBefore)}`
  )

  const playingBefore = await cdp.evaluate(
    `document.querySelector('#play-pause').dataset.playing`
  )
  await pressKey(cdp, ' ')
  await cdp.waitFor(
    'Space toggles play/pause',
    `document.querySelector('#play-pause').dataset.playing !== ${JSON.stringify(playingBefore)}`
  )
  await pressKey(cdp, ' ')
  await cdp.waitFor(
    'Space restores the play state',
    `document.querySelector('#play-pause').dataset.playing === ${JSON.stringify(playingBefore)}`
  )

  await pressKey(cdp, 'q')
  await cdp.waitFor(
    'Q opens the queue before the overlay',
    `document.querySelector('#queue-panel').hidden === false`
  )

  await pressKey(cdp, '?', { shiftKey: true })
  await cdp.waitFor(
    'Shift+/ opens the shortcuts overlay',
    `document.querySelector('#shortcut-overlay').hidden === false`
  )
  const overlay = await cdp.evaluate(`(() => {
    const root = document.querySelector('#shortcut-overlay')
    const dialog = root.querySelector('[role="dialog"]')
    return {
      modal: dialog?.getAttribute('aria-modal') ?? '',
      groups: root.querySelectorAll('.shortcut-overlay__group').length,
      labels: [...root.querySelectorAll('.shortcut-overlay__list dt')].map(
        (item) => item.textContent ?? ''
      ),
      focusedInside: dialog ? dialog.contains(document.activeElement) : false
    }
  })()`)
  runner.equal('shortcuts overlay is a modal dialog', overlay.modal, 'true')
  runner.check('overlay groups shortcuts by category', overlay.groups >= 5, String(overlay.groups))
  runner.check(
    'overlay lists playback and help shortcuts',
    overlay.labels.includes('Play / pause') &&
      overlay.labels.includes('Show keyboard shortcuts'),
    overlay.labels.join('|')
  )
  runner.check('overlay takes focus', overlay.focusedInside)

  await pressKey(cdp, 'Escape')
  await cdp.waitFor(
    'Escape closes the overlay before the queue',
    `document.querySelector('#shortcut-overlay').hidden === true &&
      document.querySelector('#queue-panel').hidden === false`
  )
  await pressKey(cdp, 'Escape')
  await cdp.waitFor(
    'Escape then closes the queue panel',
    `document.querySelector('#queue-panel').hidden === true`
  )

  const helpOpened = await clickSelector(cdp, '#shortcuts-help')
  runner.check('toolbar help button opens the overlay', helpOpened)
  await cdp.waitFor(
    'help button overlay visible',
    `document.querySelector('#shortcut-overlay').hidden === false`
  )
  await pressKey(cdp, 'Escape')
  await cdp.waitFor(
    'help button overlay closes',
    `document.querySelector('#shortcut-overlay').hidden === true`
  )

  const mediaSession = await cdp.evaluate(`(() => ({
    supported: 'mediaSession' in navigator,
    title: navigator.mediaSession?.metadata?.title ?? '',
    state: navigator.mediaSession?.playbackState ?? '',
    nowTitle: document.querySelector('#now-title').textContent
  }))()`)
  runner.check('Media Session API is available', mediaSession.supported)
  runner.equal(
    'Media Session metadata matches the playing track',
    mediaSession.title,
    mediaSession.nowTitle
  )
  runner.check(
    'Media Session playback state is published',
    mediaSession.state === 'playing' || mediaSession.state === 'paused',
    mediaSession.state
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
