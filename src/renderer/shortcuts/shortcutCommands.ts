export type ShortcutCommandId =
  | 'playPause'
  | 'nextTrack'
  | 'previousTrack'
  | 'seekBackward'
  | 'seekForward'
  | 'volumeUp'
  | 'volumeDown'
  | 'toggleShuffle'
  | 'cycleRepeat'
  | 'toggleQueue'
  | 'focusSearch'
  | 'toggleNowPlaying'
  | 'toggleTranslation'
  | 'showShortcuts'

export interface ShortcutCommandDeps {
  playPause(): void
  nextTrack(): void
  previousTrack(): void
  seekBy(delta: number): void
  adjustVolume(delta: number): void
  toggleShuffle(): void
  cycleRepeat(): void
  toggleQueuePanel(): void
  focusSearch(): void
  toggleNowPlaying(): void
  translationAvailable(): boolean
  toggleTranslation(): void
  openShortcuts(): void
}

const SEEK_STEP_SECONDS = 10
const VOLUME_STEP = 0.05

/** Maps command ids to explicitly injected handlers. No command reaches for globals. */
export function createShortcutCommands(
  deps: ShortcutCommandDeps
): Record<ShortcutCommandId, () => void> {
  return {
    playPause: () => deps.playPause(),
    nextTrack: () => deps.nextTrack(),
    previousTrack: () => deps.previousTrack(),
    seekBackward: () => deps.seekBy(-SEEK_STEP_SECONDS),
    seekForward: () => deps.seekBy(SEEK_STEP_SECONDS),
    volumeUp: () => deps.adjustVolume(VOLUME_STEP),
    volumeDown: () => deps.adjustVolume(-VOLUME_STEP),
    toggleShuffle: () => deps.toggleShuffle(),
    cycleRepeat: () => deps.cycleRepeat(),
    toggleQueue: () => deps.toggleQueuePanel(),
    focusSearch: () => deps.focusSearch(),
    toggleNowPlaying: () => deps.toggleNowPlaying(),
    toggleTranslation: () => {
      if (deps.translationAvailable()) deps.toggleTranslation()
    },
    showShortcuts: () => deps.openShortcuts()
  }
}
