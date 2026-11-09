import './style.css'
import '../styles/lyrics.css'
import '../styles/lyricSourceMenu.css'
import '../styles/contextMenu.css'
import '../styles/queuePanel.css'
import '../styles/toast.css'
import '../styles/shortcutOverlay.css'
import '../styles/favorites.css'
import '../styles/dataDisclaimer.css'
import type { Album } from '../../shared/types'
import { buildDataDisclaimerModel } from '../favorites/dataDisclaimerModel'
import { FavoritesController } from '../favorites/favoritesController'
import { buildFavoritesStatusModel } from '../favorites/favoritesStatusModel'
import { LyrixDataStatusController } from '../favorites/lyrixDataStatusController'
import { LyricsController } from '../lyrics/lyricsController'
import type { ArtistItem, TrackItem } from '../library/query'
import { ContextActions } from '../menus/contextActions'
import type { ContextMenuItem } from '../menus/contextMenuModels'
import { HtmlAudioEngine } from '../player/engine'
import { PlaybackQueue } from '../player/queue'
import type { QueuePanelEntryRow } from '../queue/queuePanelModel'
import { DEFAULT_SHORTCUTS } from '../shortcuts/defaultShortcuts'
import { ContextMenu } from '../ui/contextMenu'
import type { MenuPosition } from '../ui/contextMenu'
import { DataDisclaimer } from '../ui/dataDisclaimer'
import { syncFavoriteButtons } from '../ui/favoriteButton'
import { LyricView } from '../ui/lyricView'
import { attachMenuTrigger } from '../ui/menuTrigger'
import { QueuePanel } from '../ui/queuePanel'
import { ShortcutOverlay } from '../ui/shortcutOverlay'
import { Toast } from '../ui/toast'
import { createContextMenuOpeners } from './contextMenus'
import type { ContextMenuOpeners } from './contextMenus'
import { getAppElements } from './dom'
import { attachCoverFallbacks } from './format'
import { LibraryController } from './libraryController'
import { NavigationController } from './navigation'
import { NowPlayingController } from './nowPlaying'
import { PlayerBar } from './playerBar'
import { QueuePanelController } from './queuePanelController'
import { ScreenController } from './screen'
import { createShellFeatures } from './shellFeatures'
import type { ShellFeatures } from './shellFeatures'
import { ToolbarController } from './toolbar'
import { TransportController } from './transport'
import { FavoritesView } from './views/favoritesView'
import { TracksList } from './views/tracksList'

const TRACK_ROW_HEIGHT = 52

const elements = getAppElements()
const engine = new HtmlAudioEngine(elements.audio)
const queue = new PlaybackQueue()

let transport: TransportController
let navigation: NavigationController
let toolbar: ToolbarController
let screen: ScreenController
let nowPlaying: NowPlayingController
let library: LibraryController
let contextActions: ContextActions
let queuePanelController: QueuePanelController
let shellFeatures: ShellFeatures | null = null
let openers: ContextMenuOpeners

const isMac = /mac/i.test(navigator.platform)

const toast = new Toast({ container: elements.toastRegion })
const shortcutOverlay = new ShortcutOverlay(DEFAULT_SHORTCUTS, isMac)
const contextMenu = new ContextMenu<ContextMenuItem>({
  onSelect: (item) => contextActions.run(item),
  onOpen: () => nowPlaying.closeSourceMenu()
})

const statusController = new LyrixDataStatusController({
  api: window.library,
  onStatusChange: () => screen.refreshFavoritesView()
})

const disclaimer = new DataDisclaimer({
  onRetry: async () => {
    const status = await statusController.retry()
    await favoritesController.reload()
    return status.writable
  }
})

const favoritesController: FavoritesController = new FavoritesController({
  api: window.library,
  toast: (message) => toast.show(message),
  onWriteBlocked: (reason, retryAction) => {
    disclaimer.show(buildDataDisclaimerModel(reason), retryAction)
  },
  onStateChange: () => {
    syncFavoriteButtons(document, (trackId) => favoritesController.isFavorite(trackId))
    library.refreshFavorites()
    playerBar.updateNowPlaying()
    nowPlaying.updateContent()
    queuePanel.refresh()
  }
})

attachCoverFallbacks([
  elements.detailCoverImage,
  elements.nowCoverImage,
  elements.nowPlayingCoverImage
])

const lyricsController = new LyricsController({
  fetchSources: (trackId) => window.library.getLyricSources(trackId),
  saveChoice: (trackId, sourceId) => window.library.saveLyricChoice(trackId, sourceId),
  savePreference: (preference) => window.library.saveLyricPreference(preference),
  saveTranslationChoice: (trackId, sourceId) =>
    window.library.saveTranslationChoice(trackId, sourceId),
  saveTranslationSettings: (input) => window.library.saveTranslationSettings(input),
  preference: 'sidecar',
  translationEnabled: false,
  translationLanguage: null
})
const lyricView = new LyricView({
  scroller: elements.lyricScroll,
  lines: elements.lyricLines,
  status: elements.lyricsStatus,
  engine
})

const queuePanel = new QueuePanel(
  {
    panel: elements.queuePanel,
    scroll: elements.queueScroll,
    context: elements.queueContextLabel,
    summary: elements.queueSummaryLabel,
    clearButton: elements.queueClearButton,
    closeButton: elements.queueCloseButton
  },
  {
    onClose: () => queuePanelController.close(),
    onClear: () => queuePanelController.handleClear(),
    onToggleHistory: () => queuePanelController.handleToggleHistory(),
    onPlayEntry: (entryId) => queuePanelController.handlePlayEntry(entryId),
    onRemoveEntry: (entryId) => queuePanelController.handleRemoveEntry(entryId),
    onReorderEntry: (entryId, slot) =>
      queuePanelController.handleReorderEntry(entryId, slot),
    onMoveEntry: (entryId, direction) =>
      queuePanelController.handleMoveEntry(entryId, direction),
    onOpenMenu: (row, position) => openers.openQueueRowMenu(row, position),
    isFavorite: (trackId) => favoritesController.isFavorite(trackId),
    onToggleFavorite: (trackId) => void favoritesController.toggle(trackId)
  }
)

const tracksList = new TracksList({
  scroll: elements.trackScroll,
  empty: elements.tracksEmpty,
  rowHeight: TRACK_ROW_HEIGHT,
  emptyMessage: () => library.emptyMessage(),
  getCurrentTrackId: () => transport.getCurrentTrack()?.id ?? null,
  onPlayTrack: (index) => transport.playVisibleTrack(index),
  isFavorite: (trackId) => favoritesController.isFavorite(trackId),
  onToggleFavorite: (trackId) => void favoritesController.toggle(trackId),
  onOpenTrackMenu: (item, _index, play, position) =>
    openers.openTrackMenu(item, play, position)
})

const favoritesList = new TracksList({
  scroll: elements.favoritesScroll,
  empty: elements.favoritesEmpty,
  rowHeight: TRACK_ROW_HEIGHT,
  emptyMessage: () =>
    toolbar.getAppliedSearch().trim() === ''
      ? 'No favorites yet. Press the heart on any track.'
      : 'No results.',
  getCurrentTrackId: () => transport.getCurrentTrack()?.id ?? null,
  onPlayTrack: (index) =>
    transport.playQueue(favoritesList.getVisibleTracks(), index, {
      kind: 'favorites',
      label: 'Favorites'
    }),
  isFavorite: (trackId) => favoritesController.isFavorite(trackId),
  onToggleFavorite: (trackId) => void favoritesController.toggle(trackId),
  onOpenTrackMenu: (item, _index, play, position) =>
    openers.openTrackMenu(item, play, position)
})

const favoritesView = new FavoritesView({
  elements,
  onWhy: () => {
    const status = buildFavoritesStatusModel(statusController.getStatus())
    if (status.whyReason) {
      disclaimer.show(buildDataDisclaimerModel(status.whyReason), () => undefined)
    }
  },
  onPlay: () => {
    void transport.playQueue(favoritesList.getVisibleTracks(), 0, {
      kind: 'favorites',
      label: 'Favorites'
    })
  },
  onShuffle: () =>
    transport.shuffleTracks(favoritesList.getVisibleTracks(), {
      kind: 'favorites',
      label: 'Favorites'
    }),
  onRemoveMissing: () => void favoritesController.removeMissing()
})

const playerBar = new PlayerBar({
  elements,
  getCurrentTrack: () => transport.getCurrentTrack(),
  getAlbumForTrack: (track) => library.findAlbumForTrack(track),
  getQueueSnapshot: () => queue.getSnapshot(),
  canGoNext: () => queue.canGoNext(),
  canGoPrevious: () => queue.canGoPrevious(),
  isPlaying: () => engine.isPlaying(),
  toggleShuffle: () => transport.toggleShuffle(),
  cycleRepeat: () => transport.cycleRepeat(),
  isQueuePanelOpen: () => queuePanelController.isOpen(),
  toggleQueuePanel: () => queuePanelController.toggle(),
  isFavorite: (trackId) => favoritesController.isFavorite(trackId),
  onToggleFavorite: (trackId) => void favoritesController.toggle(trackId)
})

attachMenuTrigger(elements.nowPlayingTarget, (position) =>
  openers.openCurrentTrackMenu(position)
)

function renderNowPlaying(): void {
  playerBar.updateNowPlaying()
  nowPlaying.updateContent()
}

transport = new TransportController({
  elements,
  engine,
  queue,
  getAlbums: () => library.getAlbums(),
  getVisibleTracks: () => tracksList.getVisibleTracks(),
  getSearchText: () => toolbar.getAppliedSearch(),
  setLyricsTrack: (trackId) => lyricsController.setTrack(trackId),
  setStatus: (text) => {
    elements.statusLabel.textContent = text
  },
  saveVolume: (volume) => void window.library.saveVolume(volume),
  savePlaybackSettings: (settings) => {
    void window.library
      .savePlaybackSettings(settings)
      .catch((error) => console.error('[renderer] Could not save playback settings', error))
  },
  updateControls: () => playerBar.updateControls(),
  updateNowPlaying: renderNowPlaying,
  updateTrackHighlight: () => screen.updateTrackHighlight(),
  syncTime: (time) => playerBar.syncTime(time),
  resetTime: () => playerBar.resetTime(),
  updateDuration: (duration) => playerBar.updateDuration(duration),
  onSeekEnd: () => {
    shellFeatures?.sessionController.noteSeek()
    shellFeatures?.mediaSession.syncPosition()
  }
})

navigation = new NavigationController({
  elements,
  refresh: () => screen.refresh(),
  leaveNowPlaying: () => nowPlaying.leaveForNavigation(),
  closeNowPlaying: () => nowPlaying.closeNowPlaying(),
  clearPendingSearch: () => toolbar.clearPendingSearch(),
  getSearchValue: () => elements.searchInput.value,
  setAppliedSearch: (value) => toolbar.setAppliedSearch(value),
  saveUiState: () => saveUiState()
})

nowPlaying = new NowPlayingController({
  elements,
  getCurrentTrack: () => transport.getCurrentTrack(),
  getAlbumForTrack: (track) => library.findAlbumForTrack(track),
  lyricsState: () => lyricsController.getState(),
  subscribeLyrics: (listener) => lyricsController.subscribe(listener),
  selectLyricSource: (sourceId) => lyricsController.selectSource(sourceId),
  setLyricPreference: (preference) => lyricsController.setPreference(preference),
  setTranslationEnabled: (enabled) => lyricsController.setTranslationEnabled(enabled),
  selectTranslation: (id) => lyricsController.selectTranslation(id),
  reloadLyrics: () => lyricsController.reload(),
  lyricView,
  showSection: (section) => navigation.showSection(section),
  currentSection: () => navigation.currentSection(),
  refreshScreen: () => screen.refresh(),
  renderNowPlaying,
  closeContextMenu: () => contextMenu.close(false),
  isFavorite: (trackId) => favoritesController.isFavorite(trackId),
  onToggleFavorite: (trackId) => void favoritesController.toggle(trackId)
})

toolbar = new ToolbarController({
  elements,
  getActiveView: () => navigation.getActiveView(),
  setActiveView: (view) => navigation.setActiveView(view),
  switchView: (view) => navigation.switchView(view),
  isNowPlayingOpen: () => nowPlaying.isOpen(),
  leaveNowPlaying: () => nowPlaying.leaveForNavigation(),
  showCurrentSection: () => navigation.showSection(navigation.currentSection()),
  renderLibraryView: (view) => screen.renderLibraryView(view),
  saveUiState: () => saveUiState()
})

screen = new ScreenController({
  elements,
  navigation,
  tracksList,
  favoritesList,
  favoritesView,
  getFavoritesState: () => favoritesController.getState(),
  getFavoritesStatus: () => buildFavoritesStatusModel(statusController.getStatus()),
  isNowPlayingOpen: () => nowPlaying.isOpen(),
  getLibraryIndex: () => library.getLibraryIndex(),
  getAlbums: () => library.getAlbums(),
  getAppliedSearch: () => toolbar.getAppliedSearch(),
  getSort: (view) => toolbar.getSort(view),
  emptyMessage: () => library.emptyMessage(),
  getCurrentTrackId: () => transport.getCurrentTrack()?.id ?? null,
  onOpenAlbum: (albumId) => navigation.openAlbum(albumId),
  onOpenArtist: (artistName) => navigation.openArtist(artistName),
  onPlayTrack: (index) => transport.playVisibleTrack(index),
  onPlayAlbumTrack: (album, track) => transport.playAlbumTrack(album, track),
  onPlayAlbum: (album) => transport.playAlbum(album),
  onShuffleAlbum: (album) => transport.shuffleAlbum(album),
  onPlayArtist: (artist) => transport.playArtist(artist),
  onShuffleArtist: (artist) => transport.shuffleArtist(artist),
  onOpenAlbumMenu: (album, position) => openers.openAlbumMenu(album, position),
  onOpenArtistMenu: (artist, position) => openers.openArtistMenu(artist, position),
  onOpenTrackRowMenu: (item, _index, play, position) =>
    openers.openTrackMenu(item, play, position),
  onOpenAlbumTrackMenu: (album, track, play, position) =>
    openers.openAlbumTrackMenu(album, track, play, position),
  syncViewControls: () => toolbar.syncViewControls()
})

library = new LibraryController({
  elements,
  api: window.library,
  navigation,
  transport,
  nowPlaying,
  refreshScreen: () => screen.refresh(),
  updateNowPlaying: renderNowPlaying,
  updateTrackHighlight: () => screen.updateTrackHighlight(),
  updateControls: () => playerBar.updateControls(),
  leaveNowPlaying: () => nowPlaying.leaveForNavigation(),
  applySettings: (settings) => {
    engine.setVolume(settings.volume)
    elements.volumeSlider.value = String(settings.volume)
    queue.setShuffle(settings.shuffle)
    queue.setRepeat(settings.repeat)
    toolbar.applyUiSettings(settings)
    lyricsController.setPreference(settings.lyricPreference, { persist: false })
    lyricsController.applyTranslationSettings(
      {
        enabled: settings.translationEnabled,
        language: settings.translationLanguage
      },
      { persist: false }
    )
  },
  refreshLyrics: () => lyricsController.clearCacheAndReload(),
  getFavorites: () => ({
    ids: favoritesController.getState().ids,
    addedAt: favoritesController.getState().addedAt
  }),
  refreshFavorites: () => screen.refreshFavoritesView()
})

contextActions = new ContextActions({
  queue,
  transport,
  findAlbum: (albumId) => library.getAlbums().find((album) => album.id === albumId) ?? null,
  findArtist: (artistName) =>
    library.getLibraryIndex().items.artists.find((artist) => artist.name === artistName) ??
    null,
  openAlbum: (albumId) => navigation.openAlbum(albumId),
  openArtist: (artistName) => navigation.openArtist(artistName),
  toast: (message) => toast.show(message),
  revealTrack: (trackId) => window.library.revealTrack(trackId),
  toggleFavorite: (trackId) => void favoritesController.toggle(trackId)
})

queuePanelController = new QueuePanelController({
  panel: queuePanel,
  queue,
  findAlbum: (track) => library.findAlbumForTrack(track),
  startCurrentTrack: () => transport.startCurrentTrack(true),
  toast: (message) => toast.show(message),
  openRowMenu: (row, position) => openers.openQueueRowMenu(row, position),
  onStateChange: () => playerBar.updateControls()
})

function saveUiState(): void {
  void window.library
    .saveUiState(toolbar.currentUiState())
    .catch((error) => console.error('[renderer] Could not save view settings', error))
}

openers = createContextMenuOpeners({
  menu: contextMenu,
  getCurrentTrack: () => transport.getCurrentTrack(),
  findAlbumForTrack: (track) => library.findAlbumForTrack(track),
  isFavorite: (trackId) => favoritesController.isFavorite(trackId)
})

shellFeatures = createShellFeatures({
  elements,
  queue,
  engine,
  transport,
  nowPlaying,
  contextMenu,
  toolbar,
  queuePanel: queuePanelController,
  overlay: shortcutOverlay,
  disclaimer,
  toggleCurrentFavorite: () => {
    const track = transport.getCurrentTrack()
    if (track) void favoritesController.toggle(track.id)
  },
  getAlbumForTrack: (track) => library.findAlbumForTrack(track),
  subscribeMediaKey: (listener) => window.library.onMediaKey(listener),
  isMac
})

elements.shortcutsHelpButton.addEventListener('click', () => shortcutOverlay.open())

engine.setVolume(Number(elements.volumeSlider.value))

const disposers = [
  transport.start(),
  library.start(),
  nowPlaying.start(),
  queuePanelController.start(),
  queue.subscribe(() => playerBar.updateControls()),
  shellFeatures.shortcutController.start(),
  statusController.start(),
  favoritesController.start()
]

toolbar.syncViewControls()

async function initializeApp(): Promise<void> {
  await library.initialize()
  await statusController.reload()
  await favoritesController.reload()
  try {
    const restored = await window.library.getSession()
    if (restored) transport.restoreSession(restored.queue, restored.position)
  } catch (error) {
    console.error('[renderer] Could not restore the last session', error)
  }

  // Writes start only after restore, so applying the session never overwrites it.
  shellFeatures?.sessionController.start()
  shellFeatures?.mediaSession.start()
}

void initializeApp()

window.addEventListener('beforeunload', () => {
  shellFeatures?.sessionController.flush()
  shellFeatures?.sessionController.dispose()
  shellFeatures?.mediaSession.dispose()
  for (const dispose of disposers) dispose()
  toolbar.dispose()
  nowPlaying.destroy()
  lyricView.destroy()
  tracksList.destroy()
  favoritesList.destroy()
  favoritesView.destroy()
  queuePanel.destroy()
  contextMenu.destroy()
  shortcutOverlay.destroy()
  disclaimer.destroy()
  toast.destroy()
})
