import { delay } from './cdp.mjs'

/** Snapshot of the library/player DOM used by the full suite. */
export const LIBRARY_STATE_EXPRESSION = `(() => {
  const imgLoaded = (img) => !!img && img.complete && img.naturalWidth > 0
  const button = document.querySelector('#play-pause')
  return {
    title: document.title,
    albums: [...document.querySelectorAll('#album-grid .album-card')].map((card) => ({
      title: card.querySelector('.album-title')?.textContent ?? '',
      artist: card.querySelector('.album-artist')?.textContent ?? '',
      coverLoaded: imgLoaded(card.querySelector('img'))
    })),
    status: document.querySelector('#status')?.textContent ?? '',
    progress: {
      hidden: document.querySelector('#scan-progress')?.hidden ?? true,
      text: document.querySelector('#scan-progress')?.textContent ?? ''
    },
    gridHidden: document.querySelector('#grid-view')?.hidden ?? false,
    detailHidden: document.querySelector('#detail-view')?.hidden ?? true,
    detailTitle: document.querySelector('#detail-title')?.textContent ?? '',
    detailArtist: document.querySelector('#detail-artist')?.textContent ?? '',
    detailCoverLoaded: imgLoaded(document.querySelector('#detail-cover')),
    tracks: [...document.querySelectorAll('#track-list .track')].map((item) => ({
      title: item.querySelector('.track-title')?.textContent ?? '',
      number: item.querySelector('.track-number')?.textContent ?? '',
      duration: item.querySelector('.track-duration')?.textContent ?? '',
      playing: item.classList.contains('playing')
    })),
    nowTitle: document.querySelector('#now-title')?.textContent ?? '',
    nowArtist: document.querySelector('#now-artist')?.textContent ?? '',
    nowCoverLoaded: imgLoaded(document.querySelector('#now-cover')),
    nowCoverSrc: document.querySelector('#now-cover')?.getAttribute('src') ?? '',
    playLabel: button?.getAttribute('aria-label') ?? '',
    playing: button?.dataset.playing ?? '',
    previousDisabled: document.querySelector('#previous')?.disabled ?? true,
    nextDisabled: document.querySelector('#next')?.disabled ?? true,
    shufflePressed: document.querySelector('#shuffle')?.getAttribute('aria-pressed') ?? '',
    shuffleLabel: document.querySelector('#shuffle')?.getAttribute('aria-label') ?? '',
    repeatPressed: document.querySelector('#repeat')?.getAttribute('aria-pressed') ?? '',
    repeatLabel: document.querySelector('#repeat')?.getAttribute('aria-label') ?? '',
    repeatMode: document.querySelector('#repeat')?.dataset.repeat ?? '',
    repeatBadgeVisible:
      getComputedStyle(document.querySelector('.repeat-one-badge')).display !== 'none',
    volume: Number(document.querySelector('#volume')?.value),
    audioVolume: document.querySelector('#audio')?.volume,
    audioPaused: document.querySelector('#audio')?.paused,
    audioEnded: document.querySelector('#audio')?.ended ?? false,
    audioTime: document.querySelector('#audio')?.currentTime ?? 0,
    audioDuration: document.querySelector('#audio')?.duration ?? 0,
    seek: {
      disabled: document.querySelector('#seek')?.disabled ?? true,
      max: Number(document.querySelector('#seek')?.max ?? 0)
    },
    currentTime: document.querySelector('#current-time')?.textContent ?? '',
    rescanDisabled: document.querySelector('#rescan')?.disabled ?? true,
    activeView: [...document.querySelectorAll('#view-switcher button')].find(
      (item) => item.getAttribute('aria-pressed') === 'true'
    )?.dataset.view ?? '',
    sort: document.querySelector('#sort-select')?.value ?? '',
    sortOptions: [...document.querySelectorAll('#sort-select option')].map((option) => option.value),
    search: document.querySelector('#search')?.value ?? '',
    activeElementId: document.activeElement?.id ?? '',
    artists: [...document.querySelectorAll('#artist-list .artist-row')].map((row) => ({
      name: row.querySelector('.artist-name')?.textContent ?? '',
      meta: row.querySelector('.artist-meta')?.textContent ?? ''
    })),
    artistListHidden: document.querySelector('#artist-list')?.hidden ?? false,
    artistsEmpty: {
      hidden: document.querySelector('#artists-empty')?.hidden ?? true,
      text: document.querySelector('#artists-empty')?.textContent ?? ''
    },
    artistName: document.querySelector('#artist-name')?.textContent ?? '',
    artistMeta: document.querySelector('#artist-meta')?.textContent ?? '',
    artistAlbums: [...document.querySelectorAll('#artist-album-grid .album-card')].map(
      (card) => card.querySelector('.album-title')?.textContent ?? ''
    ),
    artistsViewHidden: document.querySelector('#artists-view')?.hidden ?? true,
    artistDetailHidden: document.querySelector('#artist-detail-view')?.hidden ?? true,
    tracksViewHidden: document.querySelector('#tracks-view')?.hidden ?? true,
    tracksEmpty: {
      hidden: document.querySelector('#tracks-empty')?.hidden ?? true,
      text: document.querySelector('#tracks-empty')?.textContent ?? ''
    },
    trackRows: [...document.querySelectorAll('#track-scroll .track-row')].map((row) => ({
      title: row.querySelector('.track-row-title')?.textContent ?? '',
      artist: row.querySelector('.track-row-artist')?.textContent ?? '',
      album: row.querySelector('.track-row-album')?.textContent ?? '',
      duration: row.querySelector('.track-row-duration')?.textContent ?? '',
      playing: row.classList.contains('playing'),
      thumbSrc: row.querySelector('img')?.getAttribute('src') ?? '',
      thumbLoaded: imgLoaded(row.querySelector('img'))
    })),
    trackRowCount: document.querySelectorAll('#track-scroll .track-row').length,
    trackScrollTop: document.querySelector('#track-scroll')?.scrollTop ?? 0,
    spacerHeight: document.querySelector('#track-scroll .virtual-list-spacer')
      ? parseFloat(document.querySelector('#track-scroll .virtual-list-spacer').style.height)
      : 0,
    emptyState: {
      hidden: document.querySelector('#empty-state')?.hidden ?? true,
      text: document.querySelector('#empty-state')?.textContent ?? ''
    }
  }
})()`

/** Snapshot of the Now Playing / lyric DOM used by the smoke suite. */
export const NOW_PLAYING_STATE_EXPRESSION = `(() => {
  const view = document.querySelector('#now-playing-view')
  const status = document.querySelector('#lyrics-status')
  const scroller = document.querySelector('#lyric-scroll')
  const lines = [...document.querySelectorAll('#lyric-lines .lyric-line')]
  return {
    hidden: view?.hidden ?? true,
    title: document.querySelector('#now-playing-title')?.textContent ?? '',
    artist: document.querySelector('#now-playing-artist')?.textContent ?? '',
    album: document.querySelector('#now-playing-album')?.textContent ?? '',
    statusHidden: status?.hidden ?? true,
    statusText: status?.textContent ?? '',
    scrollerHidden: scroller?.hidden ?? true,
    staticLines: document.querySelector('#lyric-lines')?.classList.contains('lyric-lines--static') ?? false,
    lines: lines.map((line) => ({
      index: line.dataset.index ?? '',
      agent: line.dataset.agent ?? '',
      text: line.textContent ?? '',
      current: line.classList.contains('lyric-line--current'),
      active: line.classList.contains('lyric-line--active'),
      past: line.classList.contains('lyric-line--past'),
      upcoming: line.classList.contains('lyric-line--upcoming'),
      ended: line.classList.contains('lyric-line--ended'),
      words: line.querySelectorAll('.lyric-word').length,
      segments: line.querySelectorAll('.lyric-seg').length,
      activeSegments: line.querySelectorAll('.lyric-seg--active').length,
      activeProgress: line.querySelector('.lyric-seg--active')?.style.getPropertyValue('--progress') ?? ''
    })),
    activeView: [...document.querySelectorAll('#view-switcher button')].find(
      (item) => item.getAttribute('aria-pressed') === 'true'
    )?.dataset.view ?? '',
    detailHidden: document.querySelector('#detail-view')?.hidden ?? true,
    tracksHidden: document.querySelector('#tracks-view')?.hidden ?? true,
    search: document.querySelector('#search')?.value ?? '',
    trackRows: document.querySelectorAll('#track-scroll .track-row').length,
    trackScrollTop: document.querySelector('#track-scroll')?.scrollTop ?? 0
  }
})()`

export async function readState(cdp) {
  return cdp.evaluate(LIBRARY_STATE_EXPRESSION)
}

export async function readNowPlaying(cdp) {
  return cdp.evaluate(NOW_PLAYING_STATE_EXPRESSION)
}

export async function clickSelector(cdp, selector) {
  return cdp.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) return false
    element.click()
    return true
  })()`)
}

/** Dispatches a right-click on the first match so context-menu triggers open like a real one. */
export async function rightClickSelector(cdp, selector) {
  return cdp.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) return false
    const rect = element.getBoundingClientRect()
    element.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: Math.round(rect.left + 12),
      clientY: Math.round(rect.top + 12)
    }))
    return true
  })()`)
}

/** Clicks an open context-menu item by its visible label. */
export async function clickMenuItem(cdp, label) {
  return cdp.evaluate(`(() => {
    const item = [...document.querySelectorAll('.context-menu [data-menu-item]')].find(
      (value) => value.querySelector('.context-menu__label')?.textContent === ${JSON.stringify(label)}
    )
    if (!item) return false
    item.click()
    return true
  })()`)
}

export async function clickAlbum(cdp, title, artist) {
  return cdp.evaluate(`(() => {
    const card = [...document.querySelectorAll('#album-grid .album-card')].find((item) =>
      item.querySelector('.album-title')?.textContent === ${JSON.stringify(title)} &&
      item.querySelector('.album-artist')?.textContent === ${JSON.stringify(artist)}
    )
    if (!card) return false
    card.click()
    return true
  })()`)
}

export async function clickTrack(cdp, title) {
  return cdp.evaluate(`(() => {
    const item = [...document.querySelectorAll('#track-list .track')].find((candidate) =>
      candidate.querySelector('.track-title')?.textContent === ${JSON.stringify(title)}
    )
    if (!item) return false
    item.click()
    return true
  })()`)
}

export async function clickView(cdp, view) {
  return clickSelector(cdp, `#view-switcher button[data-view="${view}"]`)
}

export async function clickArtist(cdp, name) {
  return cdp.evaluate(`(() => {
    const row = [...document.querySelectorAll('#artist-list .artist-row')].find((item) =>
      item.querySelector('.artist-name')?.textContent === ${JSON.stringify(name)}
    )
    if (!row) return false
    row.click()
    return true
  })()`)
}

export async function clickArtistAlbum(cdp, title) {
  return cdp.evaluate(`(() => {
    const card = [...document.querySelectorAll('#artist-album-grid .album-card')].find((item) =>
      item.querySelector('.album-title')?.textContent === ${JSON.stringify(title)}
    )
    if (!card) return false
    card.click()
    return true
  })()`)
}

export async function clickFirstTrackRow(cdp) {
  return clickSelector(cdp, '#track-scroll .track-row')
}

export async function setSearch(cdp, text) {
  await cdp.evaluate(`(() => {
    const input = document.querySelector('#search')
    input.value = ${JSON.stringify(text)}
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await delay(250)
}

export async function setSort(cdp, sort) {
  const changed = await cdp.evaluate(`(() => {
    const select = document.querySelector('#sort-select')
    if (![...select.options].some((option) => option.value === ${JSON.stringify(sort)})) return false
    select.value = ${JSON.stringify(sort)}
    select.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  await delay(50)
  return changed
}

export async function pressKey(cdp, key, { ctrlKey = false } = {}) {
  await cdp.evaluate(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, ctrlKey: ${ctrlKey}, bubbles: true }))`
  )
}

export async function blurActiveElement(cdp) {
  await cdp.evaluate(`document.activeElement?.blur()`)
}

export async function setTrackScroll(cdp, valueExpression) {
  await cdp.evaluate(`(() => {
    const scroller = document.querySelector('#track-scroll')
    scroller.scrollTop = ${valueExpression}
  })()`)
}

export async function pauseAudio(cdp) {
  await cdp.evaluate(`document.querySelector('#audio').pause()`)
}

export async function audioPaused(cdp) {
  return cdp.evaluate(`document.querySelector('#audio').paused`)
}
