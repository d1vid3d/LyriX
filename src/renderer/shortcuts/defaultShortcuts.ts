import type { ShortcutDefinition } from './shortcutRegistry'

/**
 * The declarative global shortcut table. Add user-configurable overrides later by layering a map
 * over these definitions; no customization UI exists today.
 */
export const DEFAULT_SHORTCUTS: readonly ShortcutDefinition[] = [
  {
    id: 'playPause',
    label: 'Play / pause',
    category: 'Playback',
    keys: [{ key: 'Space' }]
  },
  {
    id: 'nextTrack',
    label: 'Next track',
    category: 'Navigation',
    keys: [{ key: 'n' }, { key: 'ArrowRight', mod: true }]
  },
  {
    id: 'previousTrack',
    label: 'Previous track (restarts after 3 s)',
    category: 'Navigation',
    keys: [{ key: 'p' }, { key: 'ArrowLeft', mod: true }]
  },
  {
    id: 'seekBackward',
    label: 'Seek back 10 seconds',
    category: 'Navigation',
    keys: [{ key: 'j' }]
  },
  {
    id: 'seekForward',
    label: 'Seek forward 10 seconds',
    category: 'Navigation',
    keys: [{ key: 'l' }]
  },
  {
    id: 'volumeUp',
    label: 'Volume up 5%',
    category: 'Playback',
    keys: [{ key: 'ArrowUp', mod: true }]
  },
  {
    id: 'volumeDown',
    label: 'Volume down 5%',
    category: 'Playback',
    keys: [{ key: 'ArrowDown', mod: true }]
  },
  {
    id: 'toggleShuffle',
    label: 'Toggle shuffle',
    category: 'Playback',
    keys: [{ key: 's' }]
  },
  {
    id: 'cycleRepeat',
    label: 'Cycle repeat mode',
    category: 'Playback',
    keys: [{ key: 'r' }]
  },
  {
    id: 'toggleQueue',
    label: 'Toggle queue panel',
    category: 'Queue',
    keys: [{ key: 'q' }],
    when: (context) =>
      !context.contextMenuOpen && !context.sourceMenuOpen && !context.shortcutsOverlayOpen
  },
  {
    id: 'focusSearch',
    label: 'Focus search',
    category: 'Search',
    keys: [{ key: 'f', mod: true }, { key: '/' }]
  },
  {
    id: 'toggleNowPlaying',
    label: 'Toggle Now Playing',
    category: 'View',
    keys: [{ key: 'l', mod: true }]
  },
  {
    id: 'toggleTranslation',
    label: 'Toggle translation',
    category: 'View',
    keys: [{ key: 't' }],
    when: (context) => context.isNowPlayingOpen && context.translationAvailable
  },
  {
    id: 'toggleCurrentFavorite',
    label: 'Toggle current track favorite',
    category: 'Favorites',
    keys: [{ key: 'f' }]
  },
  {
    id: 'showShortcuts',
    label: 'Show keyboard shortcuts',
    category: 'Help',
    keys: [{ key: '?', shift: true }]
  }
]
