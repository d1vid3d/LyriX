import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { delay } from '../lib/cdp.mjs'
import {
  blurActiveElement,
  clickAlbum,
  clickArtist,
  clickArtistAlbum,
  clickFirstTrackRow,
  clickSelector,
  clickView,
  pressKey,
  readState,
  setSearch,
  setSort
} from '../lib/dom.mjs'

/** Views, search, sort, artists, virtualization, and UI-state persistence. */
export async function run(ctx) {
  const { cdp, runner, userDataDir } = ctx

  runner.step('full: cached relaunch')
  await cdp.waitFor(
    'cached albums rendered',
    `document.querySelectorAll('.album-card').length === 5 && document.querySelector('#status').textContent.includes('607 tracks')`,
    { timeoutMs: 20000 }
  )
  let ui = await readState(cdp)
  runner.equal('cached relaunch album count', ui.albums.length, 5)
  runner.equal('cached relaunch volume', ui.volume, 0.42)
  runner.check(
    'cached relaunch audio volume',
    Math.abs(ui.audioVolume - 0.42) < 1e-9,
    String(ui.audioVolume)
  )
  runner.check(
    'cached relaunch has no exceptions',
    cdp.exceptions.length === 0,
    cdp.exceptions.join('; ')
  )

  runner.step('full: view defaults and artists')
  runner.equal('default library view', ui.activeView, 'albums')
  runner.equal('album sort options', ui.sortOptions, ['title', 'artist', 'year'])
  runner.equal('albums sorted by title by default', ui.sort, 'title')

  runner.check('artists view clicked', await clickView(cdp, 'artists'))
  await cdp.waitFor(
    'artist list rendered',
    `document.querySelectorAll('#artist-list .artist-row').length === 5`
  )
  ui = await readState(cdp)
  runner.equal('artists view active', ui.activeView, 'artists')
  runner.equal('artists view visible', ui.artistsViewHidden, false)
  runner.equal('albums view hidden', ui.gridHidden, true)
  runner.equal('artist sort options', ui.sortOptions, ['name', 'tracks'])
  runner.equal('artist default sort', ui.sort, 'name')
  runner.equal(
    'artist names grouped exactly',
    ui.artists.map((artist) => artist.name),
    ['Album Artist A', 'Album Artist B', 'Folder Artist', 'No Art Artist', 'Unknown Artist']
  )
  runner.equal(
    'artist album and track counts',
    ui.artists.find((artist) => artist.name === 'Album Artist A')?.meta,
    '1 album · 2 tracks'
  )
  runner.equal(
    'bulk tracks stay on one unknown artist',
    ui.artists.find((artist) => artist.name === 'Unknown Artist')?.meta,
    '1 album · 602 tracks'
  )

  runner.check('artist sort changed to tracks', await setSort(cdp, 'tracks'))
  ui = await readState(cdp)
  runner.equal('artist sort persisted in view state', ui.sort, 'tracks')
  runner.equal('artists sorted by track count', ui.artists[0]?.name, 'Unknown Artist')
  runner.equal('artist totals survive sorting', ui.artists.length, 5)

  runner.step('full: search and keyboard shortcuts')
  await setSearch(cdp, 'shared')
  await cdp.waitFor(
    'artist search filtered',
    `document.querySelectorAll('#artist-list .artist-row').length === 2`
  )
  ui = await readState(cdp)
  runner.equal(
    'artist search matches album titles',
    ui.artists.map((artist) => artist.name),
    ['Album Artist A', 'Album Artist B']
  )

  await blurActiveElement(cdp)
  await pressKey(cdp, '/')
  ui = await readState(cdp)
  runner.equal('slash focuses search', ui.activeElementId, 'search')

  await pressKey(cdp, 'Escape')
  await cdp.waitFor('search cleared by escape', `document.querySelector('#search').value === ''`)
  ui = await readState(cdp)
  runner.equal('escape removes search focus', ui.activeElementId === 'search', false)
  runner.equal('escape restores full artist list', ui.artists.length, 5)

  await cdp.evaluate(`document.body.focus()`)
  await pressKey(cdp, 'f', { ctrlKey: true })
  ui = await readState(cdp)
  runner.equal('ctrl+f focuses search', ui.activeElementId, 'search')
  await pressKey(cdp, 'Escape')

  runner.step('full: artist navigation keeps search')
  await setSearch(cdp, 'shared')
  runner.check('artist row clicked', await clickArtist(cdp, 'Album Artist A'))
  await cdp.waitFor(
    'artist detail visible',
    `document.querySelector('#artist-detail-view').hidden === false`
  )
  ui = await readState(cdp)
  runner.equal('artist detail name', ui.artistName, 'Album Artist A')
  runner.equal('artist detail counts', ui.artistMeta, '1 album · 2 tracks')
  runner.equal('artist detail albums', ui.artistAlbums, ['Shared Album'])
  const artistActions = await cdp.evaluate(`(() => {
    const play = document.querySelector('#artist-play')
    const shuffle = document.querySelector('#artist-shuffle')
    return {
      playText: play?.textContent.trim() ?? '',
      playLabel: play?.getAttribute('aria-label') ?? '',
      shuffleText: shuffle?.textContent.trim() ?? '',
      shuffleLabel: shuffle?.getAttribute('aria-label') ?? ''
    }
  })()`)
  runner.check(
    'artist header exposes Play and Shuffle',
    artistActions.playText === 'Play' &&
      artistActions.playLabel === 'Play artist' &&
      artistActions.shuffleText === 'Shuffle' &&
      artistActions.shuffleLabel === 'Shuffle artist',
    JSON.stringify(artistActions)
  )

  runner.check('artist detail album clicked', await clickArtistAlbum(cdp, 'Shared Album'))
  await cdp.waitFor(
    'album detail from artist',
    `document.querySelector('#detail-view').hidden === false`
  )
  ui = await readState(cdp)
  runner.equal('album detail opened from artist', ui.detailTitle, 'Shared Album')
  const detailCoverSrc = await cdp.evaluate(
    `document.querySelector('#detail-cover')?.getAttribute('src') ?? ''`
  )
  runner.check(
    'album detail keeps the large cover',
    detailCoverSrc.includes('media://cover/') && !detailCoverSrc.includes('size=small'),
    detailCoverSrc
  )

  await clickSelector(cdp, '#back')
  await cdp.waitFor(
    'back to artist detail',
    `document.querySelector('#artist-detail-view').hidden === false`
  )
  ui = await readState(cdp)
  runner.equal('back restores artist detail', ui.artistName, 'Album Artist A')

  await clickSelector(cdp, '#artist-back')
  await cdp.waitFor(
    'back to artist list',
    `document.querySelector('#artists-view').hidden === false`
  )
  ui = await readState(cdp)
  runner.equal('back keeps search text', ui.search, 'shared')
  runner.equal('back keeps filtered artist list', ui.artists.length, 2)

  runner.step('full: album search, sort, and year ordering')
  runner.check('albums view clicked', await clickView(cdp, 'albums'))
  await cdp.waitFor(
    'album search still applied',
    `document.querySelectorAll('#album-grid .album-card').length === 2`
  )
  ui = await readState(cdp)
  runner.equal('switching views keeps search', ui.search, 'shared')
  runner.check('album opened from search', await clickAlbum(cdp, 'Shared Album', 'Album Artist A'))
  await cdp.waitFor(
    'album detail from search',
    `document.querySelector('#detail-view').hidden === false`
  )
  await clickSelector(cdp, '#back')
  await cdp.waitFor(
    'back to filtered album grid',
    `document.querySelector('#grid-view').hidden === false`
  )
  ui = await readState(cdp)
  runner.equal('album back keeps search', ui.search, 'shared')
  runner.equal('album back keeps filtered grid', ui.albums.length, 2)

  await pressKey(cdp, 'Escape')
  await cdp.waitFor(
    'album search cleared',
    `document.querySelectorAll('#album-grid .album-card').length === 5`
  )
  runner.check('sort changed to year', await setSort(cdp, 'year'))
  ui = await readState(cdp)
  runner.equal(
    'albums sorted by year with unknown last',
    ui.albums.map((album) => album.title),
    ['Folder Cover Album', 'Shared Album', 'Shared Album', 'No Art Album', 'Unknown Album']
  )

  runner.step('full: virtualized tracks view')
  runner.check('tracks view clicked', await clickView(cdp, 'tracks'))
  await cdp.waitFor(
    'virtual track rows rendered',
    `document.querySelectorAll('#track-scroll .track-row').length > 0`
  )
  ui = await readState(cdp)
  runner.equal('tracks view active', ui.activeView, 'tracks')
  runner.equal('tracks view visible', ui.tracksViewHidden, false)
  runner.equal('track sort options', ui.sortOptions, ['title', 'artist', 'album'])
  runner.equal('track default sort', ui.sort, 'title')
  runner.equal('virtual spacer covers all tracks', Math.round(ui.spacerHeight / 52), 607)
  runner.check(
    'only a window of track rows is rendered',
    ui.trackRowCount > 0 && ui.trackRowCount < 50,
    String(ui.trackRowCount)
  )
  runner.equal('first visible track row', ui.trackRows[0]?.title, 'broken')
  runner.equal('track row artist', ui.trackRows[0]?.artist, 'Unknown Artist')
  runner.equal('track row album', ui.trackRows[0]?.album, 'Unknown Album')
  runner.equal('track row duration', ui.trackRows[0]?.duration, '0:00')

  await cdp.evaluate(
    `document.querySelector('#track-scroll').scrollTop = document.querySelector('#track-scroll').scrollHeight`
  )
  await cdp.waitFor(
    'track list scrolls to the final row',
    `[...document.querySelectorAll('#track-scroll .track-row')].some((row) => row.querySelector('.track-row-title')?.textContent === 'Untagged')`
  )
  ui = await readState(cdp)
  runner.check(
    'virtual list stays bounded after scrolling',
    ui.trackRowCount > 0 && ui.trackRowCount < 50,
    String(ui.trackRowCount)
  )
  await cdp.evaluate(`document.querySelector('#track-scroll').scrollTop = 0`)
  await delay(100)

  runner.step('full: track search, thumbnails, and queue')
  await setSearch(cdp, 'first')
  await cdp.waitFor(
    'track search filtered to one row',
    `document.querySelectorAll('#track-scroll .track-row').length === 1`
  )
  await cdp.waitFor(
    'track thumbnail small cover loaded',
    `(() => { const img = document.querySelector('#track-scroll .track-row img'); return !!img && img.complete && img.naturalWidth > 0 })()`
  )
  ui = await readState(cdp)
  runner.equal('track search result', ui.trackRows[0]?.title, 'First Song')
  runner.check(
    'track thumbnail uses the small cover route',
    ui.trackRows[0]?.thumbSrc.includes('size=small') ?? false,
    ui.trackRows[0]?.thumbSrc
  )
  runner.check('track thumbnail loaded', ui.trackRows[0]?.thumbLoaded ?? false)

  runner.check('first filtered track row clicked', await clickFirstTrackRow(cdp))
  await cdp.waitFor(
    'track row plays',
    `document.querySelector('#now-title').textContent === 'First Song' && !document.querySelector('#audio').paused`
  )
  await cdp.waitFor(
    'now playing small cover loaded',
    `(() => { const img = document.querySelector('#now-cover'); return !!img && img.complete && img.naturalWidth > 0 })()`
  )
  ui = await readState(cdp)
  runner.check(
    'now playing uses the small cover route',
    ui.nowCoverSrc.includes('size=small'),
    ui.nowCoverSrc
  )
  runner.check('now playing small cover loaded', ui.nowCoverLoaded)
  runner.equal('track row highlight', ui.trackRows[0]?.playing, true)
  runner.equal('filtered visible list disables next', ui.nextDisabled, true)

  await clickSelector(cdp, '#play-pause')
  await cdp.waitFor('paused after track row test', `document.querySelector('#audio').paused`)

  await setSearch(cdp, 'zzzz')
  await cdp.waitFor('no results shown', `document.querySelector('#tracks-empty').hidden === false`)
  ui = await readState(cdp)
  runner.equal('no results message', ui.tracksEmpty.text, 'No results.')
  runner.equal('no result rows', ui.trackRowCount, 0)
  await pressKey(cdp, 'Escape')
  await cdp.waitFor(
    'escape restores track rows',
    `document.querySelectorAll('#track-scroll .track-row').length > 0`
  )

  runner.step('full: UI state persistence')
  runner.check('artists view restored for persistence', await clickView(cdp, 'artists'))
  await cdp.waitFor(
    'artist view visible for persistence',
    `document.querySelector('#artists-view').hidden === false`
  )
  runner.check('artist sort tracks for persistence', await setSort(cdp, 'tracks'))
  await setSearch(cdp, 'shared')
  const settingsDeadline = Date.now() + 5000
  let saved = null
  while (Date.now() < settingsDeadline) {
    try {
      saved = JSON.parse(await fs.readFile(join(userDataDir, 'settings.json'), 'utf8'))
      if (saved.lastView === 'artists' && saved.sortByView?.artists === 'tracks') break
    } catch {
      // Not written yet.
    }
    await delay(50)
  }
  runner.equal('last view persisted', saved?.lastView, 'artists')
  runner.equal('per-view sort persisted', saved?.sortByView?.artists, 'tracks')
  runner.equal('album sort persisted separately', saved?.sortByView?.albums, 'year')
  runner.check(
    'search text is not persisted',
    !JSON.stringify(saved).includes('"search"') && !JSON.stringify(saved).includes('shared'),
    JSON.stringify(saved)
  )

  runner.step('full: reload restores view state')
  const apiBeforeReload = await cdp.evaluate(`typeof window.library?.getSettings`)
  runner.equal('preload API before reload', apiBeforeReload, 'function')
  await cdp.evaluate(`location.reload()`)
  await cdp.waitFor(
    'restored artists view rendered',
    `document.querySelector('#artists-view')?.hidden === false && document.querySelectorAll('#artist-list .artist-row').length === 5`,
    { timeoutMs: 20000 }
  )
  ui = await readState(cdp)
  runner.equal('view restored on relaunch', ui.activeView, 'artists')
  runner.equal('artist sort restored on relaunch', ui.sort, 'tracks')
  runner.equal('artists restored by track count', ui.artists[0]?.name, 'Unknown Artist')
  runner.equal('search is empty on relaunch', ui.search, '')
  runner.equal('restored library still has all tracks', ui.artists.length, 5)
}
