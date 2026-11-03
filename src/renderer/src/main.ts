import './style.css'
import type { Album, LibrarySnapshot, ScanProgress, Track } from '../../shared/types'
import { HtmlAudioEngine } from '../player/engine'
import type { PlaybackEngine } from '../player/engine'
import { PlaybackQueue } from '../player/queue'

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

const gridView = getElement<HTMLElement>('grid-view')
const detailView = getElement<HTMLElement>('detail-view')
const albumGrid = getElement<HTMLDivElement>('album-grid')
const emptyState = getElement<HTMLParagraphElement>('empty-state')

const backButton = getElement<HTMLButtonElement>('back')
const detailCoverImage = getElement<HTMLImageElement>('detail-cover')
const detailTitle = getElement<HTMLHeadingElement>('detail-title')
const detailArtist = getElement<HTMLParagraphElement>('detail-artist')
const detailYear = getElement<HTMLParagraphElement>('detail-year')
const trackList = getElement<HTMLOListElement>('track-list')

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

interface PlaybackAttempt {
  failed: boolean
}

let albums: Album[] = []
let folderName: string | null = null
let activeAlbumId: string | null = null
let isSeeking = false
let libraryEventReceived = false
let activeAttempt: PlaybackAttempt | null = null

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

function createCover(url: string, alt: string): HTMLDivElement {
  const cover = document.createElement('div')
  cover.className = 'cover'

  const image = document.createElement('img')
  image.loading = 'lazy'
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

function findAlbumForTrack(track: Track): Album | null {
  return albums.find((album) => album.tracks.some((item) => item.id === track.id)) ?? null
}

function renderGrid(): void {
  albumGrid.replaceChildren()

  if (albums.length === 0) {
    albumGrid.hidden = true
    emptyState.hidden = false
    emptyState.textContent = folderName
      ? 'No .flac files found in that folder.'
      : 'Open a folder to list its .flac files.'
    return
  }

  albumGrid.hidden = false
  emptyState.hidden = true

  const fragment = document.createDocumentFragment()
  for (const album of albums) {
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
    fragment.append(card)
  }

  albumGrid.append(fragment)
}

function renderDetail(): void {
  const album = albums.find((item) => item.id === activeAlbumId)
  if (!album) {
    closeAlbum()
    return
  }

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
  setCoverImage(nowCoverImage, album?.coverUrl ?? null, album ? `${album.title} cover` : '')
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

function playAlbumTrack(album: Album, track: Track): void {
  const index = album.tracks.findIndex((item) => item.id === track.id)
  if (index < 0) return

  const wasCurrent = queue.current()?.id === track.id
  queue.setQueue(album.tracks, index)

  if (wasCurrent) {
    updateTrackHighlight()
    updateControls()
    if (!engine.isPlaying()) resumeCurrentTrack()
    return
  }

  startCurrentTrack(true)
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
  activeAlbumId = albumId
  gridView.hidden = true
  detailView.hidden = false
  renderDetail()
}

function closeAlbum(): void {
  activeAlbumId = null
  detailView.hidden = true
  gridView.hidden = false
}

function reconcileQueue(): void {
  const track = queue.current()
  if (!track) return

  const album = findAlbumForTrack(track)
  if (!album) {
    resetPlayback()
    return
  }

  const index = album.tracks.findIndex((item) => item.id === track.id)
  queue.setQueue(album.tracks, index)
}

function applySnapshot(snapshot: LibrarySnapshot): void {
  albums = snapshot.albums
  folderName = snapshot.folderName

  reconcileQueue()
  updateStatus()
  renderGrid()

  if (activeAlbumId !== null) {
    if (albums.some((album) => album.id === activeAlbumId)) {
      renderDetail()
    } else {
      closeAlbum()
    }
  }

  updateNowPlaying()
  updateTrackHighlight()
  updateControls()
  setScanning(false)
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
    closeAlbum()
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

backButton.addEventListener('click', closeAlbum)

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

void initialize()

window.addEventListener('beforeunload', () => {
  for (const unsubscribe of unsubscribeEngine) unsubscribe()
  unsubscribeProgress()
  unsubscribeUpdated()
})
