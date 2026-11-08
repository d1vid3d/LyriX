export interface AppElements {
  audio: HTMLAudioElement

  openFolderButton: HTMLButtonElement
  rescanButton: HTMLButtonElement
  statusLabel: HTMLSpanElement
  progressLabel: HTMLSpanElement
  viewButtons: HTMLButtonElement[]
  sortSelect: HTMLSelectElement
  searchInput: HTMLInputElement

  gridView: HTMLElement
  detailView: HTMLElement
  artistsView: HTMLElement
  tracksView: HTMLElement
  artistDetailView: HTMLElement
  albumGrid: HTMLDivElement
  emptyState: HTMLParagraphElement

  artistList: HTMLUListElement
  artistsEmpty: HTMLParagraphElement
  trackScroll: HTMLDivElement
  tracksEmpty: HTMLParagraphElement

  backButton: HTMLButtonElement
  detailCoverImage: HTMLImageElement
  detailTitle: HTMLHeadingElement
  detailArtist: HTMLParagraphElement
  detailYear: HTMLParagraphElement
  albumPlayButton: HTMLButtonElement
  albumShuffleButton: HTMLButtonElement
  trackList: HTMLOListElement

  artistBackButton: HTMLButtonElement
  artistNameLabel: HTMLHeadingElement
  artistMetaLabel: HTMLParagraphElement
  artistPlayButton: HTMLButtonElement
  artistShuffleButton: HTMLButtonElement
  artistAlbumGrid: HTMLDivElement

  shuffleButton: HTMLButtonElement
  previousButton: HTMLButtonElement
  playPauseButton: HTMLButtonElement
  nextButton: HTMLButtonElement
  repeatButton: HTMLButtonElement
  queueToggleButton: HTMLButtonElement
  currentTimeLabel: HTMLSpanElement
  seekBar: HTMLInputElement
  durationLabel: HTMLSpanElement
  volumeSlider: HTMLInputElement
  nowCoverImage: HTMLImageElement
  nowTitle: HTMLSpanElement
  nowArtist: HTMLSpanElement

  nowPlayingSection: HTMLElement
  nowPlayingTarget: HTMLElement
  nowPlayingCloseButton: HTMLButtonElement
  nowPlayingCoverImage: HTMLImageElement
  nowPlayingTitle: HTMLHeadingElement
  nowPlayingArtist: HTMLParagraphElement
  nowPlayingAlbum: HTMLParagraphElement
  lyricSourceMenu: HTMLDivElement
  translationToggle: HTMLDivElement
  lyricsStatus: HTMLParagraphElement
  lyricScroll: HTMLDivElement
  lyricLines: HTMLDivElement

  queuePanel: HTMLElement
  queueScroll: HTMLDivElement
  queueContextLabel: HTMLElement
  queueSummaryLabel: HTMLElement
  queueClearButton: HTMLButtonElement
  queueCloseButton: HTMLButtonElement
  toastRegion: HTMLDivElement
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing element #${id}`)
  return element as T
}

/** Looks up every required element once and fails early when markup is missing. */
export function getAppElements(): AppElements {
  return {
    audio: getElement<HTMLAudioElement>('audio'),

    openFolderButton: getElement<HTMLButtonElement>('open-folder'),
    rescanButton: getElement<HTMLButtonElement>('rescan'),
    statusLabel: getElement<HTMLSpanElement>('status'),
    progressLabel: getElement<HTMLSpanElement>('scan-progress'),
    viewButtons: [
      ...document.querySelectorAll<HTMLButtonElement>('#view-switcher button[data-view]')
    ],
    sortSelect: getElement<HTMLSelectElement>('sort-select'),
    searchInput: getElement<HTMLInputElement>('search'),

    gridView: getElement<HTMLElement>('grid-view'),
    detailView: getElement<HTMLElement>('detail-view'),
    artistsView: getElement<HTMLElement>('artists-view'),
    tracksView: getElement<HTMLElement>('tracks-view'),
    artistDetailView: getElement<HTMLElement>('artist-detail-view'),
    albumGrid: getElement<HTMLDivElement>('album-grid'),
    emptyState: getElement<HTMLParagraphElement>('empty-state'),

    artistList: getElement<HTMLUListElement>('artist-list'),
    artistsEmpty: getElement<HTMLParagraphElement>('artists-empty'),
    trackScroll: getElement<HTMLDivElement>('track-scroll'),
    tracksEmpty: getElement<HTMLParagraphElement>('tracks-empty'),

    backButton: getElement<HTMLButtonElement>('back'),
    detailCoverImage: getElement<HTMLImageElement>('detail-cover'),
    detailTitle: getElement<HTMLHeadingElement>('detail-title'),
    detailArtist: getElement<HTMLParagraphElement>('detail-artist'),
    detailYear: getElement<HTMLParagraphElement>('detail-year'),
    albumPlayButton: getElement<HTMLButtonElement>('album-play'),
    albumShuffleButton: getElement<HTMLButtonElement>('album-shuffle'),
    trackList: getElement<HTMLOListElement>('track-list'),

    artistBackButton: getElement<HTMLButtonElement>('artist-back'),
    artistNameLabel: getElement<HTMLHeadingElement>('artist-name'),
    artistMetaLabel: getElement<HTMLParagraphElement>('artist-meta'),
    artistPlayButton: getElement<HTMLButtonElement>('artist-play'),
    artistShuffleButton: getElement<HTMLButtonElement>('artist-shuffle'),
    artistAlbumGrid: getElement<HTMLDivElement>('artist-album-grid'),

    shuffleButton: getElement<HTMLButtonElement>('shuffle'),
    previousButton: getElement<HTMLButtonElement>('previous'),
    playPauseButton: getElement<HTMLButtonElement>('play-pause'),
    nextButton: getElement<HTMLButtonElement>('next'),
    repeatButton: getElement<HTMLButtonElement>('repeat'),
    queueToggleButton: getElement<HTMLButtonElement>('queue-toggle'),
    currentTimeLabel: getElement<HTMLSpanElement>('current-time'),
    seekBar: getElement<HTMLInputElement>('seek'),
    durationLabel: getElement<HTMLSpanElement>('duration'),
    volumeSlider: getElement<HTMLInputElement>('volume'),
    nowCoverImage: getElement<HTMLImageElement>('now-cover'),
    nowTitle: getElement<HTMLSpanElement>('now-title'),
    nowArtist: getElement<HTMLSpanElement>('now-artist'),

    nowPlayingSection: getElement<HTMLElement>('now-playing-view'),
    nowPlayingTarget: getElement<HTMLElement>('now-playing'),
    nowPlayingCloseButton: getElement<HTMLButtonElement>('now-playing-close'),
    nowPlayingCoverImage: getElement<HTMLImageElement>('now-playing-cover'),
    nowPlayingTitle: getElement<HTMLHeadingElement>('now-playing-title'),
    nowPlayingArtist: getElement<HTMLParagraphElement>('now-playing-artist'),
    nowPlayingAlbum: getElement<HTMLParagraphElement>('now-playing-album'),
    lyricSourceMenu: getElement<HTMLDivElement>('lyric-source-menu'),
    translationToggle: getElement<HTMLDivElement>('translation-toggle'),
    lyricsStatus: getElement<HTMLParagraphElement>('lyrics-status'),
    lyricScroll: getElement<HTMLDivElement>('lyric-scroll'),
    lyricLines: getElement<HTMLDivElement>('lyric-lines'),

    queuePanel: getElement<HTMLElement>('queue-panel'),
    queueScroll: getElement<HTMLDivElement>('queue-scroll'),
    queueContextLabel: getElement<HTMLElement>('queue-context'),
    queueSummaryLabel: getElement<HTMLElement>('queue-summary'),
    queueClearButton: getElement<HTMLButtonElement>('queue-clear'),
    queueCloseButton: getElement<HTMLButtonElement>('queue-close'),
    toastRegion: getElement<HTMLDivElement>('toast-region')
  }
}
