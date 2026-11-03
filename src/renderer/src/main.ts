import './style.css'
import type {
  Album,
  LibrarySnapshot,
  ScanProgress,
  Settings,
  Track,
  UiState
} from '../../shared/types'
import { HtmlAudioEngine } from '../player/engine'
import type { PlaybackEngine } from '../player/engine'
import { PlaybackQueue } from '../player/queue'
import {
  buildLibraryIndex,
  getDefaultSort,
  getSortOptions,
  getViewIds,
  isLibraryView,
  isSortKey,
  queryLibrary
} from '../library/query'
import type { LibraryIndex, LibraryView, TrackItem } from '../library/query'
import { VirtualList } from '../ui/virtualList'

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing element #${id}`)
  return element as T
}

const engine: PlaybackEngine = new HtmlAudioEngine(getElement<HTMLAudioElement>('audio'))
const queue = new PlaybackQueue()

const openFolderButton = getElement<HTMLButtonElement>('open-folder')
const rescanButton = getElement<HTMLButtonElement>('rescan')
const statusLabel = getElement<HTMLSpanElement>('status')
const progressLabel = getElement<HTMLSpanElement>('scan-progress')
const viewButtons = [
  ...document.querySelectorAll<HTMLButtonElement>('#view-switcher button[data-view]')
]
const sortSelect = getElement<HTMLSelectElement>('sort-select')
const searchInput = getElement<HTMLInputElement>('search')

const gridView = getElement<HTMLElement>('grid-view')
const detailView = getElement<HTMLElement>('detail-view')
const artistsView = getElement<HTMLElement>('artists-view')
const tracksView = getElement<HTMLElement>('tracks-view')
const artistDetailView = getElement<HTMLElement>('artist-detail-view')
const albumGrid = getElement<HTMLDivElement>('album-grid')
const emptyState = getElement<HTMLParagraphElement>('empty-state')

const artistList = getElement<HTMLUListElement>('artist-list')
const artistsEmpty = getElement<HTMLParagraphElement>('artists-empty')
const trackScroll = getElement<HTMLDivElement>('track-scroll')
const tracksEmpty = getElement<HTMLParagraphElement>('tracks-empty')

const backButton = getElement<HTMLButtonElement>('back')
const detailCoverImage = getElement<HTMLImageElement>('detail-cover')
const detailTitle = getElement<HTMLHeadingElement>('detail-title')
const detailArtist = getElement<HTMLParagraphElement>('detail-artist')
const detailYear = getElement<HTMLParagraphElement>('detail-year')
const trackList = getElement<HTMLOListElement>('track-list')

const artistBackButton = getElement<HTMLButtonElement>('artist-back')
const artistNameLabel = getElement<HTMLHeadingElement>('artist-name')
const artistMetaLabel = getElement<HTMLParagraphElement>('artist-meta')
const artistAlbumGrid = getElement<HTMLDivElement>('artist-album-grid')

const previousButton = getElement<HTMLButtonElement>('previous')
const playPauseButton = getElement<HTMLButtonElement>('play-pause')
const nextButton = getElement<HTMLButtonElement>('next')
const currentTimeLabel = getElement<HTMLSpanElement>('current-time')
const seekBar = getElement<HTMLInputElement>('seek')
const durationLabel = getElement<HTMLSpanElement>('duration')
const volumeSlider = getElement<HTMLInputElement>('volume')
const nowCoverImage = getElement<HTMLImageElement>('now-cover')
const nowTitle = getElement<HTMLSpanElement>('now-title')
const nowArtist = getElement<HTMLSpanElement>('now-artist')

type DetailRoute =
  | { kind: 'album'; albumId: string }
  | { kind: 'artist'; artistName: string }

interface PlaybackAttempt {
  failed: boolean
}

const TRACK_ROW_HEIGHT = 52

let albums: Album[] = []
let libraryIndex: LibraryIndex = buildLibraryIndex([])
let folderName: string | null = null
let activeView: LibraryView = 'albums'
const sortByView: Record<LibraryView, string> = {
  albums: getDefaultSort('albums'),
  artists: getDefaultSort('artists'),
  tracks: getDefaultSort('tracks')
}
let detailStack: DetailRoute[] = []
let appliedSearch = ''
let searchTimer: ReturnType<typeof setTimeout> | null = null
let visibleTrackItems: TrackItem[] = []
let isSeeking = false
let libraryEventReceived = false
let activeAttempt: PlaybackAttempt | null = null

const tracksVirtualList = new VirtualList<TrackItem>({
  container: trackScroll,
  rowHeight: TRACK_ROW_HEIGHT,
  overscan: 4,
  renderRow: (item, index) => createTrackRow(item, index)
})

engine.setVolume(Number(volumeSlider.value))

for (const image of [detailCoverImage, nowCoverImage]) {
  image.addEventListener('error', () => {
    image.hidden = true
  })
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function smallCoverUrl(url: string): string {
  return `${url}?size=small`
}

function createCover(url: string, alt: string, extraClass = ''): HTMLDivElement {
  const cover = document.createElement('div')
  cover.className = extraClass ? `cover ${extraClass}` : 'cover'

  const image = document.createElement('img')
  image.loading = 'lazy'
  image.decoding = 'async'
  image.alt = alt
  image.src = url
  image.addEventListener('error', () => {
    image.hidden = true
  })

  const fallback = document.createElement('span')
  fallback.className = 'cover-fallback'
  fallback.setAttribute('aria-hidden', 'true')
  fallback.textContent = '♪'

  cover.append(image, fallback)
  return cover
}

function setCoverImage(image: HTMLImageElement, url: string | null, alt: string): void {
  if (!url) {
    image.hidden = true
    image.removeAttribute('src')
    image.alt = ''
    return
  }

  image.hidden = false
  image.alt = alt
  image.src = url
}

function setScanning(scanning: boolean): void {
  openFolderButton.disabled = scanning
  rescanButton.disabled = scanning || folderName === null

  if (!scanning) {
    progressLabel.hidden = true
    progressLabel.textContent = ''
  }
}

function updateStatus(): void {
  if (!folderName) {
    statusLabel.textContent = 'No folder selected'
    return
  }

  const trackCount = albums.reduce((count, album) => count + album.tracks.length, 0)
  const albumLabel = albums.length === 1 ? '1 album' : `${albums.length} albums`
  const trackLabel = trackCount === 1 ? '1 track' : `${trackCount} tracks`
  statusLabel.textContent = `${folderName} · ${albumLabel} · ${trackLabel}`
}

function emptyMessage(): string {
  if (albums.length === 0) {
    return folderName
      ? 'No .flac files found in that folder.'
      : 'Open a folder to list its .flac files.'
  }
  return 'No results.'
}

function findAlbumForTrack(track: Track): Album | null {
  return albums.find((album) => album.tracks.some((item) => item.id === track.id)) ?? null
}

function createAlbumCard(album: Album): HTMLButtonElement {
  const card = document.createElement('button')
  card.type = 'button'
  card.className = 'album-card'
  card.append(createCover(album.coverUrl, `${album.title} cover`))

  const title = document.createElement('span')
  title.className = 'album-title'
  title.textContent = album.title

  const artist = document.createElement('span')
  artist.className = 'album-artist'
  artist.textContent = album.artist

  card.append(title, artist)
  card.addEventListener('click', () => openAlbum(album.id))
  return card
}

function renderAlbumCards(container: HTMLElement, list: readonly Album[]): void {
  const fragment = document.createDocumentFragment()
  for (const album of list) fragment.append(createAlbumCard(album))
  container.replaceChildren(fragment)
}

function renderAlbums(): void {
  const items = queryLibrary(libraryIndex, {
    view: 'albums',
    search: appliedSearch,
    sort: sortByView.albums
  })

  if (items.length === 0) {
    albumGrid.replaceChildren()
    albumGrid.hidden = true
    emptyState.hidden = false
    emptyState.textContent = emptyMessage()
    return
  }

  albumGrid.hidden = false
  emptyState.hidden = true
  renderAlbumCards(
    albumGrid,
    items.map((item) => item.album)
  )
}

function renderArtists(): void {
  const items = queryLibrary(libraryIndex, {
    view: 'artists',
    search: appliedSearch,
    sort: sortByView.artists
  })

  artistList.replaceChildren()

  if (items.length === 0) {
    artistList.hidden = true
    artistsEmpty.hidden = false
    artistsEmpty.textContent = emptyMessage()
    return
  }

  artistList.hidden = false
  artistsEmpty.hidden = true

  const fragment = document.createDocumentFragment()
  for (const artist of items) {
    const item = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'artist-row'

    const name = document.createElement('span')
    name.className = 'artist-name'
    name.textContent = artist.name

    const albumLabel = artist.albumCount === 1 ? '1 album' : `${artist.albumCount} albums`
    const trackLabel = artist.trackCount === 1 ? '1 track' : `${artist.trackCount} tracks`
    const meta = document.createElement('span')
    meta.className = 'artist-meta'
    meta.textContent = `${albumLabel} · ${trackLabel}`

    button.append(name, meta)
    button.addEventListener('click', () => openArtist(artist.name))
    item.append(button)
    fragment.append(item)
  }

  artistList.append(fragment)
}

function renderTracks(): void {
  const items = queryLibrary(libraryIndex, {
    view: 'tracks',
    search: appliedSearch,
    sort: sortByView.tracks
  })
  visibleTrackItems = items

  if (items.length === 0) {
    trackScroll.hidden = true
    tracksEmpty.hidden = false
    tracksEmpty.textContent = emptyMessage()
    tracksVirtualList.setItems([])
    return
  }

  trackScroll.hidden = false
  tracksEmpty.hidden = true
  tracksVirtualList.setItems(items)
}

function renderLibraryView(view: LibraryView): void {
  if (view === 'albums') renderAlbums()
  else if (view === 'artists') renderArtists()
  else renderTracks()
}

function syncViewControls(): void {
  for (const button of viewButtons) {
    const view = button.dataset.view
    button.setAttribute('aria-pressed', String(view === activeView))
  }

  const fragment = document.createDocumentFragment()
  for (const option of getSortOptions(activeView)) {
    const element = document.createElement('option')
    element.value = option.key
    element.textContent = option.label
    fragment.append(element)
  }
  sortSelect.replaceChildren(fragment)
  sortSelect.value = sortByView[activeView]
}

function showSection(section: HTMLElement): void {
  for (const view of [gridView, artistsView, tracksView, detailView, artistDetailView]) {
    view.hidden = view !== section
  }
}

function refreshScreen(): void {
  syncViewControls()

  const detail = detailStack[detailStack.length - 1]
  if (detail) {
    // Keep the hidden list ready so Back restores it with search and sort applied.
    renderLibraryView(activeView)

    if (detail.kind === 'album') {
      showSection(detailView)
      renderAlbumDetail(detail.albumId)
    } else {
      showSection(artistDetailView)
      renderArtistDetail(detail.artistName)
    }
    return
  }

  const section =
    activeView === 'albums' ? gridView : activeView === 'artists' ? artistsView : tracksView
  showSection(section)
  renderLibraryView(activeView)
}

function backLabel(): string {
  const parent = detailStack[detailStack.length - 2]
  if (parent?.kind === 'artist') return '← Artist'
  if (activeView === 'artists') return '← Artists'
  if (activeView === 'tracks') return '← Tracks'
  return '← Albums'
}

function renderAlbumDetail(albumId: string): void {
  const album = albums.find((item) => item.id === albumId)
  if (!album) {
    detailStack.pop()
    refreshScreen()
    return
  }

  backButton.textContent = backLabel()
  detailTitle.textContent = album.title
  detailArtist.textContent = album.artist

  if (album.year === null) {
    detailYear.hidden = true
    detailYear.textContent = ''
  } else {
    detailYear.hidden = false
    detailYear.textContent = String(album.year)
  }

  setCoverImage(detailCoverImage, album.coverUrl, `${album.title} cover`)
  renderTrackList(album)
}

function renderArtistDetail(artistName: string): void {
  const artist = libraryIndex.items.artists.find((item) => item.name === artistName)
  if (!artist) {
    detailStack.pop()
    refreshScreen()
    return
  }

  artistBackButton.textContent = '← Artists'
  artistNameLabel.textContent = artist.name

  const albumLabel = artist.albumCount === 1 ? '1 album' : `${artist.albumCount} albums`
  const trackLabel = artist.trackCount === 1 ? '1 track' : `${artist.trackCount} tracks`
  artistMetaLabel.textContent = `${albumLabel} · ${trackLabel}`

  renderAlbumCards(artistAlbumGrid, artist.albums)
}

function renderTrackList(album: Album): void {
  trackList.replaceChildren()
  const fragment = document.createDocumentFragment()
  const currentId = queue.current()?.id ?? null

  for (const track of album.tracks) {
    const item = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'track'
    button.dataset.trackId = track.id

    if (currentId === track.id) {
      button.classList.add('playing')
      button.setAttribute('aria-current', 'true')
    }

    const number = document.createElement('span')
    number.className = 'track-number'
    number.textContent = track.trackNumber === null ? '—' : String(track.trackNumber)

    const title = document.createElement('span')
    title.className = 'track-title'
    title.textContent = track.title

    const duration = document.createElement('span')
    duration.className = 'track-duration'
    duration.textContent = formatTime(track.duration)

    button.append(title, duration)
    button.prepend(number)
    button.addEventListener('click', () => playAlbumTrack(album, track))

    item.append(button)
    fragment.append(item)
  }

  trackList.append(fragment)
}

function createTrackRow(item: TrackItem, index: number): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'track-row'

  if (queue.current()?.id === item.track.id) {
    button.classList.add('playing')
    button.setAttribute('aria-current', 'true')
  }

  const thumb = createCover(
    smallCoverUrl(item.album.coverUrl),
    `${item.album.title} cover`,
    'track-thumb'
  )

  const title = document.createElement('span')
  title.className = 'track-row-title'
  title.textContent = item.track.title

  const artist = document.createElement('span')
  artist.className = 'track-row-artist'
  artist.textContent = item.track.artist

  const album = document.createElement('span')
  album.className = 'track-row-album'
  album.textContent = item.album.title

  const duration = document.createElement('span')
  duration.className = 'track-row-duration'
  duration.textContent = formatTime(item.track.duration)

  button.append(thumb, title, artist, album, duration)
  button.addEventListener('click', () => playVisibleTrack(index))
  return button
}

function updateTrackHighlight(): void {
  const currentId = queue.current()?.id ?? null

  for (const button of trackList.querySelectorAll<HTMLButtonElement>('.track')) {
    const isCurrent = button.dataset.trackId === currentId
    button.classList.toggle('playing', isCurrent)
    if (isCurrent) {
      button.setAttribute('aria-current', 'true')
    } else {
      button.removeAttribute('aria-current')
    }
  }

  tracksVirtualList.refresh()
}

function updateNowPlaying(): void {
  const track = queue.current()
  if (!track) {
    nowTitle.textContent = 'Nothing playing'
    nowArtist.textContent = ''
    setCoverImage(nowCoverImage, null, '')
    return
  }

  const album = findAlbumForTrack(track)
  nowTitle.textContent = track.title
  nowArtist.textContent = track.artist
  setCoverImage(
    nowCoverImage,
    album ? smallCoverUrl(album.coverUrl) : null,
    album ? `${album.title} cover` : ''
  )
}

function updateControls(): void {
  const hasCurrent = queue.current() !== null
  const playing = engine.isPlaying()

  playPauseButton.textContent = playing ? 'Pause' : 'Play'
  playPauseButton.setAttribute('aria-label', playing ? 'Pause' : 'Play')
  playPauseButton.disabled = !hasCurrent
  previousButton.disabled = !hasCurrent
  nextButton.disabled = !queue.hasNext()
}

function updateDuration(duration: number): void {
  if (!Number.isFinite(duration) || duration <= 0) {
    durationLabel.textContent = '0:00'
    seekBar.max = '0'
    seekBar.disabled = true
    return
  }

  durationLabel.textContent = formatTime(duration)
  seekBar.max = String(duration)
  seekBar.disabled = false
}

function syncTimeUi(time: number): void {
  seekBar.value = String(time)
  currentTimeLabel.textContent = formatTime(time)
}

function resetTimeUi(): void {
  isSeeking = false
  seekBar.value = '0'
  seekBar.max = '0'
  seekBar.disabled = true
  currentTimeLabel.textContent = '0:00'
  durationLabel.textContent = '0:00'
}

function resetPlayback(): void {
  activeAttempt = null
  queue.setQueue([])
  engine.pause()
  resetTimeUi()
  updateControls()
  updateNowPlaying()
  updateTrackHighlight()
}

function playQueue(tracks: readonly Track[], index: number): void {
  const track = tracks[index]
  if (!track) return

  const wasCurrent = queue.current()?.id === track.id
  queue.setQueue(tracks, index)

  if (wasCurrent) {
    updateTrackHighlight()
    updateControls()
    if (!engine.isPlaying()) resumeCurrentTrack()
    return
  }

  startCurrentTrack(true)
}

function playAlbumTrack(album: Album, track: Track): void {
  const index = album.tracks.findIndex((item) => item.id === track.id)
  if (index < 0) return
  playQueue(album.tracks, index)
}

function playVisibleTrack(index: number): void {
  const tracks = visibleTrackItems.map((item) => item.track)
  playQueue(tracks, index)
}

function startCurrentTrack(autoplay: boolean): void {
  const track = queue.current()
  if (!track) {
    resetPlayback()
    return
  }

  const attempt: PlaybackAttempt = {
    failed: false
  }
  activeAttempt = attempt

  engine.load(track)
  resetTimeUi()
  updateNowPlaying()
  updateTrackHighlight()
  updateControls()

  if (autoplay) {
    void engine.play().catch((error) => handlePlaybackFailure(attempt, error))
  }
}

function resumeCurrentTrack(): void {
  const track = queue.current()
  if (!track) return

  const duration = engine.getDuration()
  if (duration > 0 && engine.getPosition() >= duration - 0.05) {
    engine.seek(0)
    syncTimeUi(0)
  }

  const attempt: PlaybackAttempt = {
    failed: false
  }
  activeAttempt = attempt
  void engine.play().catch((error) => handlePlaybackFailure(attempt, error))
}

function handlePlaybackFailure(attempt: PlaybackAttempt, error: unknown): void {
  if (activeAttempt !== attempt || attempt.failed) return

  // Pausing interrupts an in-flight play() promise. That is not a track failure.
  if (error instanceof Error && error.name === 'AbortError') return

  attempt.failed = true

  const track = queue.current()
  console.error(`[renderer] Could not play ${track?.title ?? 'track'}`, error)
  statusLabel.textContent = track ? `Could not play ${track.title}.` : 'Could not play this file.'

  if (queue.hasNext()) {
    queue.next()
    startCurrentTrack(true)
    return
  }

  engine.pause()
  updateControls()
}

function handleEnded(): void {
  if (queue.hasNext()) {
    queue.next()
    startCurrentTrack(true)
    return
  }

  engine.pause()
  syncTimeUi(engine.getPosition())
  updateControls()
}

function openAlbum(albumId: string): void {
  detailStack.push({ kind: 'album', albumId })
  refreshScreen()
}

function openArtist(artistName: string): void {
  detailStack.push({ kind: 'artist', artistName })
  refreshScreen()
}

function goBack(): void {
  detailStack.pop()
  refreshScreen()
}

function switchView(view: LibraryView): void {
  if (activeView === view && detailStack.length === 0) return

  if (searchTimer !== null) {
    clearTimeout(searchTimer)
    searchTimer = null
  }

  activeView = view
  detailStack = []
  appliedSearch = searchInput.value
  refreshScreen()
  saveUiState()
}

function reconcileQueue(): void {
  const current = queue.current()
  if (!current) return

  const refreshed: Track[] = []
  for (const track of queue.getTracks()) {
    const found = findTrackById(track.id)
    if (found) refreshed.push(found)
  }

  const index = refreshed.findIndex((track) => track.id === current.id)
  if (index < 0) {
    resetPlayback()
    return
  }

  queue.setQueue(refreshed, index)
}

function findTrackById(trackId: string): Track | null {
  for (const album of albums) {
    const track = album.tracks.find((item) => item.id === trackId)
    if (track) return track
  }
  return null
}

function detailExists(route: DetailRoute): boolean {
  if (route.kind === 'album') return albums.some((album) => album.id === route.albumId)
  return libraryIndex.items.artists.some((artist) => artist.name === route.artistName)
}

function applySnapshot(snapshot: LibrarySnapshot): void {
  albums = snapshot.albums
  libraryIndex = buildLibraryIndex(albums)
  folderName = snapshot.folderName

  reconcileQueue()
  updateStatus()

  while (detailStack.length > 0 && !detailExists(detailStack[detailStack.length - 1])) {
    detailStack.pop()
  }

  refreshScreen()
  updateNowPlaying()
  updateTrackHighlight()
  updateControls()
  setScanning(false)
}

function applyUiSettings(settings: Settings): void {
  activeView = isLibraryView(settings.lastView) ? settings.lastView : 'albums'

  for (const view of getViewIds()) {
    const savedSort = settings.sortByView[view]
    sortByView[view] = isSortKey(view, savedSort) ? savedSort : getDefaultSort(view)
  }

  syncViewControls()
}

function currentUiState(): UiState {
  return {
    lastView: activeView,
    sortByView: { ...sortByView }
  }
}

function saveUiState(): void {
  void window.library
    .saveUiState(currentUiState())
    .catch((error) => console.error('[renderer] Could not save view settings', error))
}

function applySearch(search: string): void {
  appliedSearch = search
  renderLibraryView(activeView)
}

function clearSearch(): void {
  if (searchTimer !== null) {
    clearTimeout(searchTimer)
    searchTimer = null
  }

  searchInput.value = ''
  searchInput.blur()
  applySearch('')
}

function isTextInput(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  )
}

async function openFolder(): Promise<void> {
  openFolderButton.disabled = true
  rescanButton.disabled = true

  try {
    const snapshot = await window.library.openFolder()
    if (!snapshot) {
      setScanning(false)
      return
    }

    resetPlayback()
    detailStack = []
    applySnapshot(snapshot)
  } catch (error) {
    console.error('[renderer] Open folder failed', error)
    statusLabel.textContent = 'Could not open that folder.'
    setScanning(false)
  }
}

async function rescanLibrary(): Promise<void> {
  openFolderButton.disabled = true
  rescanButton.disabled = true

  try {
    const snapshot = await window.library.rescan()
    if (snapshot) applySnapshot(snapshot)
    else setScanning(false)
  } catch (error) {
    console.error('[renderer] Rescan failed', error)
    statusLabel.textContent = 'Could not rescan that folder.'
    setScanning(false)
  }
}

function handleProgress(progress: ScanProgress): void {
  openFolderButton.disabled = true
  rescanButton.disabled = true
  progressLabel.hidden = false
  progressLabel.textContent =
    progress.total > 0 ? `Scanning ${progress.scanned} / ${progress.total}` : 'Scanning…'
}

openFolderButton.addEventListener('click', () => {
  void openFolder()
})

rescanButton.addEventListener('click', () => {
  void rescanLibrary()
})

for (const button of viewButtons) {
  button.addEventListener('click', () => {
    const view = button.dataset.view
    if (isLibraryView(view)) switchView(view)
  })
}

sortSelect.addEventListener('change', () => {
  const sort = sortSelect.value
  if (!isSortKey(activeView, sort)) return
  sortByView[activeView] = sort
  renderLibraryView(activeView)
  saveUiState()
})

searchInput.addEventListener('input', () => {
  if (searchTimer !== null) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = null
    applySearch(searchInput.value)
  }, 150)
})

window.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    searchInput.focus()
    searchInput.select()
    return
  }

  if (event.key === 'Escape' && (document.activeElement === searchInput || searchInput.value)) {
    event.preventDefault()
    clearSearch()
    return
  }

  if (
    event.key === '/' &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !isTextInput(event.target)
  ) {
    event.preventDefault()
    searchInput.focus()
    searchInput.select()
  }
})

backButton.addEventListener('click', goBack)
artistBackButton.addEventListener('click', goBack)

previousButton.addEventListener('click', () => {
  if (!queue.current()) return

  if (engine.getPosition() > 3) {
    engine.seek(0)
    syncTimeUi(0)
    return
  }

  if (queue.hasPrevious()) {
    queue.previous()
    startCurrentTrack(true)
    return
  }

  engine.seek(0)
  syncTimeUi(0)
})

playPauseButton.addEventListener('click', () => {
  if (!queue.current()) return

  if (engine.isPlaying()) {
    engine.pause()
    return
  }

  resumeCurrentTrack()
})

nextButton.addEventListener('click', () => {
  if (!queue.hasNext()) return
  queue.next()
  startCurrentTrack(true)
})

const unsubscribeEngine = [
  engine.on('play', updateControls),
  engine.on('pause', updateControls),
  engine.on('ended', handleEnded),
  engine.on('loadedmetadata', (duration) => updateDuration(duration)),
  engine.on('timeupdate', (position) => {
    if (!isSeeking) syncTimeUi(position)
  }),
  engine.on('error', (error) => {
    if (activeAttempt) handlePlaybackFailure(activeAttempt, error)
  })
]

seekBar.addEventListener('pointerdown', () => {
  isSeeking = true
})

seekBar.addEventListener('input', () => {
  const time = Number(seekBar.value)
  if (!Number.isFinite(time)) return

  currentTimeLabel.textContent = formatTime(time)
  // Seek live while dragging; repeat range requests are handled by the media protocol.
  engine.seek(time)
})

function finishSeeking(): void {
  isSeeking = false
}

seekBar.addEventListener('change', finishSeeking)
seekBar.addEventListener('pointerup', finishSeeking)
seekBar.addEventListener('pointercancel', finishSeeking)
window.addEventListener('pointerup', finishSeeking)

volumeSlider.addEventListener('input', () => {
  engine.setVolume(Number(volumeSlider.value))
})

volumeSlider.addEventListener('change', () => {
  void window.library.saveVolume(Number(volumeSlider.value))
})

const unsubscribeProgress = window.library.onScanProgress(handleProgress)
const unsubscribeUpdated = window.library.onLibraryUpdated((snapshot) => {
  libraryEventReceived = true
  applySnapshot(snapshot)
})

async function initialize(): Promise<void> {
  try {
    const settings = await window.library.getSettings()
    engine.setVolume(settings.volume)
    volumeSlider.value = String(settings.volume)
    applyUiSettings(settings)
  } catch (error) {
    console.error('[renderer] Could not load settings', error)
  }

  try {
    const snapshot = await window.library.getState()
    // A background refresh event may beat the getState response; don't overwrite fresher data.
    if (!libraryEventReceived) applySnapshot(snapshot)
  } catch (error) {
    console.error('[renderer] Could not load library', error)
    statusLabel.textContent = 'Could not load the library.'
  }
}

syncViewControls()
void initialize()

window.addEventListener('beforeunload', () => {
  for (const unsubscribe of unsubscribeEngine) unsubscribe()
  unsubscribeProgress()
  unsubscribeUpdated()
  tracksVirtualList.destroy()
})
