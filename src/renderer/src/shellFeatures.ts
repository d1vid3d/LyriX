import type { Album, MediaKeyAction, Track } from '../../shared/types'
import type { PlaybackEngine } from '../player/engine'
import type { PlaybackQueue } from '../player/queue'
import { MediaSessionController } from '../media/mediaSession'
import { SessionController } from '../session/sessionController'
import { createShortcutCommands } from '../shortcuts/shortcutCommands'
import { DEFAULT_SHORTCUTS } from '../shortcuts/defaultShortcuts'
import { EscapeLayerStack, ESCAPE_LAYER_PRIORITIES } from '../shortcuts/layerStack'
import { ShortcutController } from '../shortcuts/shortcutController'
import type { ShortcutContext } from '../shortcuts/shortcutRegistry'
import type { ShortcutOverlay } from '../ui/shortcutOverlay'
import type { AppElements } from './dom'

export interface ShellTransport {
  playPause(): void
  play(): void
  pause(): void
  nextTrack(): void
  previousTrack(): void
  seekBy(delta: number): void
  seekTo(seconds: number): void
  adjustVolume(delta: number): void
  toggleShuffle(): void
  cycleRepeat(): void
}

export interface ShellNowPlaying {
  isOpen(): boolean
  isSourceMenuOpen(): boolean
  isTranslationAvailable(): boolean
  closeSourceMenuAndFocus(): void
  closeNowPlaying(): void
  toggle(): void
  toggleTranslation(): void
}

export interface ShellQueuePanel {
  isOpen(): boolean
  close(): void
  toggle(): void
}

export interface ShellContextMenu {
  isOpen(): boolean
  close(restoreFocus?: boolean): void
}

export interface ShellToolbar {
  focusSearch(): void
  clearSearch(): void
}

export interface ShellFeatureDeps {
  elements: AppElements
  queue: PlaybackQueue
  engine: PlaybackEngine
  transport: ShellTransport
  nowPlaying: ShellNowPlaying
  contextMenu: ShellContextMenu
  toolbar: ShellToolbar
  queuePanel: ShellQueuePanel
  overlay: ShortcutOverlay
  disclaimer: { isOpen(): boolean; close(): void }
  toggleCurrentFavorite(): void
  getAlbumForTrack(track: Track): Album | null
  subscribeMediaKey(listener: (action: MediaKeyAction) => void): () => void
  isMac: boolean
}

export interface ShellFeatures {
  layers: EscapeLayerStack
  shortcutController: ShortcutController
  sessionController: SessionController
  mediaSession: MediaSessionController
}

/**
 * Wires the shell-level features that depend on the controllers: shortcut commands, the Escape
 * layer stack, the resume-session tracker, and the Media Session integration.
 */
export function createShellFeatures(deps: ShellFeatureDeps): ShellFeatures {
  const layers = new EscapeLayerStack()

  const context = (): ShortcutContext => ({
    isNowPlayingOpen: deps.nowPlaying.isOpen(),
    translationAvailable: deps.nowPlaying.isTranslationAvailable(),
    contextMenuOpen: deps.contextMenu.isOpen(),
    sourceMenuOpen: deps.nowPlaying.isSourceMenuOpen(),
    shortcutsOverlayOpen: deps.overlay.isOpen()
  })

  const commands = createShortcutCommands({
    playPause: () => deps.transport.playPause(),
    nextTrack: () => deps.transport.nextTrack(),
    previousTrack: () => deps.transport.previousTrack(),
    seekBy: (delta) => deps.transport.seekBy(delta),
    adjustVolume: (delta) => deps.transport.adjustVolume(delta),
    toggleShuffle: () => deps.transport.toggleShuffle(),
    cycleRepeat: () => deps.transport.cycleRepeat(),
    toggleQueuePanel: () => deps.queuePanel.toggle(),
    focusSearch: () => deps.toolbar.focusSearch(),
    toggleNowPlaying: () => deps.nowPlaying.toggle(),
    translationAvailable: () => deps.nowPlaying.isTranslationAvailable(),
    toggleTranslation: () => deps.nowPlaying.toggleTranslation(),
    toggleCurrentFavorite: () => deps.toggleCurrentFavorite(),
    openShortcuts: () => deps.overlay.open()
  })

  const shortcutController = new ShortcutController({
    definitions: DEFAULT_SHORTCUTS,
    commands,
    layers,
    context,
    isMac: deps.isMac
  })

  layers.register({
    id: 'contextMenu',
    priority: ESCAPE_LAYER_PRIORITIES.contextMenu,
    isOpen: () => deps.contextMenu.isOpen(),
    close: () => deps.contextMenu.close(true)
  })
  layers.register({
    id: 'dataDisclaimer',
    priority: ESCAPE_LAYER_PRIORITIES.dataDisclaimer,
    isOpen: () => deps.disclaimer.isOpen(),
    close: () => deps.disclaimer.close()
  })
  layers.register({
    id: 'shortcutsOverlay',
    priority: ESCAPE_LAYER_PRIORITIES.shortcutsOverlay,
    isOpen: () => deps.overlay.isOpen(),
    close: () => deps.overlay.close()
  })
  layers.register({
    id: 'lyricSourceMenu',
    priority: ESCAPE_LAYER_PRIORITIES.lyricSourceMenu,
    isOpen: () => deps.nowPlaying.isSourceMenuOpen(),
    close: () => deps.nowPlaying.closeSourceMenuAndFocus()
  })
  layers.register({
    id: 'queuePanel',
    priority: ESCAPE_LAYER_PRIORITIES.queuePanel,
    isOpen: () => deps.queuePanel.isOpen(),
    close: () => deps.queuePanel.close()
  })
  layers.register({
    id: 'nowPlaying',
    priority: ESCAPE_LAYER_PRIORITIES.nowPlaying,
    isOpen: () => deps.nowPlaying.isOpen(),
    close: () => deps.nowPlaying.closeNowPlaying()
  })
  layers.register({
    id: 'searchClear',
    priority: ESCAPE_LAYER_PRIORITIES.searchClear,
    isOpen: () =>
      document.activeElement === deps.elements.searchInput ||
      deps.elements.searchInput.value !== '',
    close: () => deps.toolbar.clearSearch()
  })

  const sessionController = new SessionController({
    queue: deps.queue,
    engine: deps.engine,
    saveQueue: (state) => {
      void window.library
        .saveSessionQueue(state)
        .catch((error) => console.error('[renderer] Could not save the queue session', error))
    },
    savePosition: (state) => {
      void window.library
        .saveSessionPosition(state)
        .catch((error) => console.error('[renderer] Could not save the playback position', error))
    }
  })

  const mediaSession = new MediaSessionController({
    engine: deps.engine,
    queue: deps.queue,
    getAlbumForTrack: (track) => deps.getAlbumForTrack(track),
    play: () => deps.transport.play(),
    pause: () => deps.transport.pause(),
    playPause: () => deps.transport.playPause(),
    previous: () => deps.transport.previousTrack(),
    next: () => deps.transport.nextTrack(),
    seekBy: (delta) => deps.transport.seekBy(delta),
    seekTo: (seconds) => deps.transport.seekTo(seconds),
    subscribeMediaKey: (listener) => deps.subscribeMediaKey(listener)
  })

  return { layers, shortcutController, sessionController, mediaSession }
}
