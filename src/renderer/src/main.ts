import './style.css'
import '../styles/lyrics.css'
import '../styles/lyricSourceMenu.css'
import { LyricsController } from '../lyrics/lyricsController'
import { HtmlAudioEngine } from '../player/engine'
import { PlaybackQueue } from '../player/queue'
import { LyricView } from '../ui/lyricView'
import { getAppElements } from './dom'
import { attachCoverFallbacks } from './format'
import { LibraryController } from './libraryController'
import { NavigationController } from './navigation'
import { NowPlayingController } from './nowPlaying'
import { PlayerBar } from './playerBar'
import { ScreenController } from './screen'
import { ToolbarController } from './toolbar'
import { TransportController } from './transport'
import { TracksList } from './views/tracksList'

const TRACK_ROW_HEIGHT = 52

const elements = getAppElements()
const engine = new HtmlAudioEngine(elements.audio)
const queue = new PlaybackQueue()

attachCoverFallbacks([
  elements.detailCoverImage,
  elements.nowCoverImage,
  elements.nowPlayingCoverImage
])

const lyricsController = new LyricsController({
  fetchSources: (trackId) => window.library.getLyricSources(trackId),
  saveChoice: (trackId, sourceId) => window.library.saveLyricChoice(trackId, sourceId),
  savePreference: (preference) => window.library.saveLyricPreference(preference),
  preference: 'sidecar'
})
const lyricView = new LyricView({
  scroller: elements.lyricScroll,
  lines: elements.lyricLines,
  status: elements.lyricsStatus,
  engine
})

let transport: TransportController
let navigation: NavigationController
let toolbar: ToolbarController
let screen: ScreenController
let nowPlaying: NowPlayingController
let library: LibraryController

const tracksList = new TracksList({
  scroll: elements.trackScroll,
  empty: elements.tracksEmpty,
  rowHeight: TRACK_ROW_HEIGHT,
  emptyMessage: () => library.emptyMessage(),
  getCurrentTrackId: () => transport.getCurrentTrack()?.id ?? null,
  onPlayTrack: (index) => transport.playVisibleTrack(index)
})

const playerBar = new PlayerBar({
  elements,
  getCurrentTrack: () => transport.getCurrentTrack(),
  getAlbumForTrack: (track) => library.findAlbumForTrack(track),
  hasNext: () => queue.hasNext(),
  isPlaying: () => engine.isPlaying()
})

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
  setLyricsTrack: (trackId) => lyricsController.setTrack(trackId),
  setStatus: (text) => {
    elements.statusLabel.textContent = text
  },
  saveVolume: (volume) => void window.library.saveVolume(volume),
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
  reloadLyrics: () => lyricsController.reload(),
  lyricView,
  showSection: (section) => navigation.showSection(section),
  currentSection: () => navigation.currentSection(),
  refreshScreen: () => screen.refresh(),
  renderNowPlaying
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
  saveUiState: () => saveUiState()
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
    toolbar.applyUiSettings(settings)
    lyricsController.setPreference(settings.lyricPreference, { persist: false })
  },
  refreshLyrics: () => lyricsController.clearCacheAndReload()
})

function saveUiState(): void {
  void window.library
    .saveUiState(toolbar.currentUiState())
    .catch((error) => console.error('[renderer] Could not save view settings', error))
}

engine.setVolume(Number(elements.volumeSlider.value))

const disposers = [transport.start(), library.start(), nowPlaying.start()]

toolbar.syncViewControls()
void library.initialize()

window.addEventListener('beforeunload', () => {
  for (const dispose of disposers) dispose()
  toolbar.dispose()
  nowPlaying.destroy()
  lyricView.destroy()
  tracksList.destroy()
})
