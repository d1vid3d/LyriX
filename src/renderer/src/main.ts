import './style.css'
import type { Album, LibrarySnapshot, ScanProgress, Track } from '../../shared/types'

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing element #${id}`)
  return element as T
}

const audio = getElement<HTMLAudioElement>('audio')
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

const playPauseButton = getElement<HTMLButtonElement>('play-pause')
const currentTimeLabel = getElement<HTMLSpanElement>('current-time')
const seekBar = getElement<HTMLInputElement>('seek')
const durationLabel = getElement<HTMLSpanElement>('duration')
const volumeSlider = getElement<HTMLInputElement>('volume')
const nowCoverImage = getElement<HTMLImageElement>('now-cover')
const nowTitle = getElement<HTMLSpanElement>('now-title')
const nowArtist = getElement<HTMLSpanElement>('now-artist')

let albums: Album[] = []
let folderName: string | null = null
let activeAlbumId: string | null = null
let current: { track: Track; album: Album } | null = null
let isSeeking = false
let libraryEventReceived = false

audio.volume = Number(volumeSlider.value)

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

  for (const track of album.tracks) {
    const item = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'track'
    button.dataset.trackId = track.id

    if (current?.track.id === track.id) {
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
    button.addEventListener('click', () => {
      void playTrack(track, album)
    })

    item.append(button)
    fragment.append(item)
  }

  trackList.append(fragment)
}

function updateTrackHighlight(): void {
  for (const button of trackList.querySelectorAll<HTMLButtonElement>('.track')) {
    const isCurrent = button.dataset.trackId === current?.track.id
    button.classList.toggle('playing', isCurrent)
    if (isCurrent) {
      button.setAttribute('aria-current', 'true')
    } else {
      button.removeAttribute('aria-current')
    }
  }
}

function updateNowPlaying(): void {
  if (!current) {
    nowTitle.textContent = 'Nothing playing'
    nowArtist.textContent = ''
    setCoverImage(nowCoverImage, null, '')
    return
  }

  nowTitle.textContent = current.track.title
  nowArtist.textContent = current.track.artist
  setCoverImage(nowCoverImage, current.album.coverUrl, `${current.album.title} cover`)
}

function updatePlayButton(): void {
  const playing = !audio.paused && !audio.ended
  playPauseButton.textContent = playing ? 'Pause' : 'Play'
  playPauseButton.setAttribute('aria-label', playing ? 'Pause' : 'Play')
  playPauseButton.disabled = current === null
}

function updateDuration(): void {
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
    durationLabel.textContent = '0:00'
    seekBar.max = '0'
    seekBar.disabled = true
    return
  }

  durationLabel.textContent = formatTime(audio.duration)
  seekBar.max = String(audio.duration)
  seekBar.disabled = false
}

function syncTimeUi(time: number): void {
  seekBar.value = String(time)
  currentTimeLabel.textContent = formatTime(time)
}

function resetPlayback(): void {
  current = null
  isSeeking = false
  audio.pause()
  audio.removeAttribute('src')
  audio.load()

  seekBar.value = '0'
  seekBar.max = '0'
  seekBar.disabled = true
  currentTimeLabel.textContent = '0:00'
  durationLabel.textContent = '0:00'
  updatePlayButton()
  updateNowPlaying()
  updateTrackHighlight()
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

function applySnapshot(snapshot: LibrarySnapshot): void {
  albums = snapshot.albums
  folderName = snapshot.folderName

  updateStatus()
  renderGrid()

  if (activeAlbumId !== null) {
    if (albums.some((album) => album.id === activeAlbumId)) {
      renderDetail()
    } else {
      closeAlbum()
    }
  }

  if (current) {
    const album = albums.find((item) => item.id === current?.album.id)
    const track = album?.tracks.find((item) => item.id === current?.track.id)

    if (!album || !track) {
      resetPlayback()
    } else {
      current = { track, album }
      updateNowPlaying()
      updateTrackHighlight()
    }
  }

  updatePlayButton()
  setScanning(false)
}

async function playTrack(track: Track, album: Album): Promise<void> {
  const changedTrack = current?.track.id !== track.id
  current = { track, album }

  if (changedTrack) {
    audio.src = track.url
    currentTimeLabel.textContent = '0:00'
    durationLabel.textContent = '0:00'
    seekBar.value = '0'
    seekBar.max = '0'
    seekBar.disabled = true
  }

  updateNowPlaying()
  updateTrackHighlight()
  updatePlayButton()

  try {
    await audio.play()
  } catch (error) {
    console.error('[renderer] Playback failed', error)
    statusLabel.textContent = `Could not play ${track.title}.`
    updatePlayButton()
  }
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

playPauseButton.addEventListener('click', () => {
  if (!current) return

  if (audio.paused) {
    void audio.play().catch((error) => {
      console.error('[renderer] Playback failed', error)
      statusLabel.textContent = 'Could not play this file.'
    })
  } else {
    audio.pause()
  }
})

audio.addEventListener('play', updatePlayButton)
audio.addEventListener('pause', updatePlayButton)
audio.addEventListener('ended', updatePlayButton)
audio.addEventListener('loadedmetadata', updateDuration)
audio.addEventListener('durationchange', updateDuration)

audio.addEventListener('timeupdate', () => {
  if (!isSeeking) syncTimeUi(audio.currentTime)
})

audio.addEventListener('error', () => {
  if (!current) return
  console.error('[renderer] Audio element error', audio.error)
  statusLabel.textContent = 'Could not play this file.'
  updatePlayButton()
})

seekBar.addEventListener('pointerdown', () => {
  isSeeking = true
})

seekBar.addEventListener('input', () => {
  const time = Number(seekBar.value)
  if (!Number.isFinite(time)) return

  currentTimeLabel.textContent = formatTime(time)
  // Seek live while dragging; repeat range requests are handled by the media protocol.
  audio.currentTime = time
})

function finishSeeking(): void {
  isSeeking = false
}

seekBar.addEventListener('change', finishSeeking)
seekBar.addEventListener('pointerup', finishSeeking)
seekBar.addEventListener('pointercancel', finishSeeking)
window.addEventListener('pointerup', finishSeeking)

volumeSlider.addEventListener('input', () => {
  audio.volume = Number(volumeSlider.value)
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
    audio.volume = settings.volume
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
  unsubscribeProgress()
  unsubscribeUpdated()
})
