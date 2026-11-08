import './style.css'
import '../styles/lyrics.css'
import '../styles/lyricSourceMenu.css'
import '../styles/contextMenu.css'
import '../styles/queuePanel.css'
import '../styles/toast.css'
import type { Album } from '../../shared/types'
import { LyricsController } from '../lyrics/lyricsController'
import type { ArtistItem, TrackItem } from '../library/query'
import { ContextActions } from '../menus/contextActions'
import {
  buildAlbumMenu,
  buildArtistMenu,
  buildCurrentTrackMenu,
  buildQueueRowMenu,
  buildTrackMenu
} from '../menus/contextMenuModels'
import type { ContextMenuItem } from '../menus/contextMenuModels'
import { HtmlAudioEngine } from '../player/engine'
import { PlaybackQueue } from '../player/queue'
import type { QueuePanelEntryRow } from '../queue/queuePanelModel'
import { ContextMenu } from '../ui/contextMenu'
import type { MenuPosition } from '../ui/contextMenu'
import { LyricView } from '../ui/lyricView'
import { attachMenuTrigger } from '../ui/menuTrigger'
import { QueuePanel } from '../ui/queuePanel'
import { Toast } from '../ui/toast'
import { getAppElements } from './dom'
import { attachCoverFallbacks } from './format'
import { LibraryController } from './libraryController'
import { NavigationController } from './navigation'
import { NowPlayingController } from './nowPlaying'
import { PlayerBar } from './playerBar'
import { QueuePanelController } from './queuePanelController'
import { ScreenController } from './screen'
import { ToolbarController } from './toolbar'
import { TransportController } from './transport'
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

const toast = new Toast({ container: elements.toastRegion })
const contextMenu = new ContextMenu<ContextMenuItem>({
  onSelect: (item) => contextActions.run(item),
  onOpen: () => nowPlaying.closeSourceMenu()
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
    onOpenMenu: (row, position) => openQueueRowMenu(row, position)
  }
)

const tracksList = new TracksList({
  scroll: elements.trackScroll,
  empty: elements.tracksEmpty,
  rowHeight: TRACK_ROW_HEIGHT,
  emptyMessage: () => library.emptyMessage(),
  getCurrentTrackId: () => transport.getCurrentTrack()?.id ?? null,
  onPlayTrack: (index) => transport.playVisibleTrack(index),
  onOpenTrackMenu: (item, _index, play, position) =>
    openTrackMenu(item, play, position)
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
  toggleQueuePanel: () => queuePanelController.toggle()
})

attachMenuTrigger(elements.nowPlayingTarget, (position) => openCurrentTrackMenu(position))

function openTrackMenu(item: TrackItem, play: () => void, position: MenuPosition): void {
  contextMenu.show(
    buildTrackMenu({ track: item.track, album: item.album, play }),
    position
  )
}

function openAlbumTrackMenu(
  album: Album,
  track: Album['tracks'][number],
  play: () => void,
  position: MenuPosition
): void {
  contextMenu.show(buildTrackMenu({ track, album, play }), position)
}

function openAlbumMenu(album: Album, position: MenuPosition): void {
  contextMenu.show(buildAlbumMenu({ album }), position)
}

function openArtistMenu(artist: ArtistItem, position: MenuPosition): void {
  contextMenu.show(buildArtistMenu({ artist }), position)
}

function openQueueRowMenu(row: QueuePanelEntryRow, position: MenuPosition): void {
  contextMenu.show(buildQueueRowMenu(row), position)
}

function openCurrentTrackMenu(position: MenuPosition): void {
  const track = transport.getCurrentTrack()
  if (!track) return

  const album = library.findAlbumForTrack(track)
  contextMenu.show(
    buildCurrentTrackMenu({
      track,
      albumId: album?.id ?? null,
      artistName: album?.artist ?? track.artist
    }),
    position
  )
}

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
  updateDuration: (duration) => playerBar.updateDuration(duration)
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
  closeContextMenu: () => contextMenu.close(false)
})

toolbar = new ToolbarController({
  elements,
  getActiveView: () => navigation.getActiveView(),
  setActiveView: (view) => navigation.setActiveView(view),
  switchView: (view) => navigation.switchView(view),
  isNowPlayingOpen: () => nowPlaying.isOpen(),
  leaveNowPlaying: () => nowPlaying.leaveForNavigation(),
  closeNowPlaying: () => nowPlaying.closeNowPlaying(),
  showCurrentSection: () => navigation.showSection(navigation.currentSection()),
  renderLibraryView: (view) => screen.renderLibraryView(view),
  saveUiState: () => saveUiState(),
  isContextMenuOpen: () => contextMenu.isOpen(),
  closeContextMenu: () => contextMenu.close(true),
  isSourceMenuOpen: () => nowPlaying.isSourceMenuOpen(),
  closeSourceMenu: () => nowPlaying.closeSourceMenu(),
  isQueuePanelOpen: () => queuePanelController.isOpen(),
  closeQueuePanel: () => queuePanelController.close(),
  toggleQueuePanel: () => queuePanelController.toggle()
})

screen = new ScreenController({
  elements,
  navigation,
  tracksList,
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
  onOpenAlbumMenu: (album, position) => openAlbumMenu(album, position),
  onOpenArtistMenu: (artist, position) => openArtistMenu(artist, position),
  onOpenTrackRowMenu: (item, _index, play, position) =>
    openTrackMenu(item, play, position),
  onOpenAlbumTrackMenu: (album, track, play, position) =>
    openAlbumTrackMenu(album, track, play, position),
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
  refreshLyrics: () => lyricsController.clearCacheAndReload()
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
  revealTrack: (trackId) => window.library.revealTrack(trackId)
})

queuePanelController = new QueuePanelController({
  panel: queuePanel,
  queue,
  findAlbum: (track) => library.findAlbumForTrack(track),
  startCurrentTrack: () => transport.startCurrentTrack(true),
  toast: (message) => toast.show(message),
  openRowMenu: (row, position) => openQueueRowMenu(row, position),
  onStateChange: () => playerBar.updateControls()
})

function saveUiState(): void {
  void window.library
    .saveUiState(toolbar.currentUiState())
    .catch((error) => console.error('[renderer] Could not save view settings', error))
}

engine.setVolume(Number(elements.volumeSlider.value))

const disposers = [
  transport.start(),
  library.start(),
  nowPlaying.start(),
  queuePanelController.start(),
  queue.subscribe(() => playerBar.updateControls())
]

toolbar.syncViewControls()
void library.initialize()

window.addEventListener('beforeunload', () => {
  for (const dispose of disposers) dispose()
  toolbar.dispose()
  nowPlaying.destroy()
  lyricView.destroy()
  tracksList.destroy()
  queuePanel.destroy()
  contextMenu.destroy()
  toast.destroy()
})
