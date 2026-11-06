# Playback, Transport, Now Playing, and Player Bar

**Purpose:** the renderer's playback state machine: queue, engine adapter, transport controls,
Now Playing lifecycle, and the bottom bar.

**Owning source paths:** `src/renderer/src/transport.ts`, `src/renderer/src/nowPlaying.ts`,
`src/renderer/src/playerBar.ts`, `src/renderer/player/engine.ts`,
`src/renderer/player/queue.ts`.

**Last verified:** 2026-11-06 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md) (invariants 9 and 10),
[renderer/shell-and-navigation.md](shell-and-navigation.md),
[renderer/lyrics-controller.md](lyrics-controller.md),
[renderer/lyric-source-menu.md](lyric-source-menu.md), [flows.md](../flows.md).

## Transport (`src/renderer/src/transport.ts`)

Owns the `PlaybackQueue`, the engine subscriptions, `isSeeking`, and `activeAttempt`.

- `playQueue` sets the queue; clicking the already-current track resumes instead of reloading.
- `playAlbumTrack` queues the album in album order; `playVisibleTrack` queues the visible track list.
- `startCurrentTrack` loads the track, requests lyrics, resets time UI, and optionally plays.
- `handleEnded` advances or stops; `handlePlaybackFailure` ignores `AbortError`, skips forward when
  possible, and otherwise pauses.
- `previous` restarts the track when position > 3 s, otherwise moves back.
- `reconcileQueue` rebuilds the queue from current track ids and resets playback when the current
  track disappeared.
- Seek bar, volume, and engine event wiring live here. `start()` subscribes to engine events and
  returns one disposer.

The visible track list comes from the tracks view ([renderer/shell-and-navigation.md](shell-and-navigation.md));
lyric loading is started through [renderer/lyrics-controller.md](lyrics-controller.md).

## Now Playing and player bar (`src/renderer/src/nowPlaying.ts`, `src/renderer/src/playerBar.ts`)

`NowPlayingController` owns `nowPlayingOpen` and `libraryDirtyWhileNowPlaying`:

- `openNowPlaying` renders the current track, shows the Now Playing section, and applies the current
  lyric state.
- `closeNowPlaying` restores the previous section, or re-renders first when the library changed while
  it was open; both close paths also close the source menu.
- `leaveForNavigation` closes it silently for actions that will render another view.
- It subscribes to the lyric controller and only renders while open, but it always updates the
  source-menu and translation-toggle view models. The menu callbacks are wired to `selectSource`,
  `setPreference`, `setTranslationEnabled`, `selectTranslation`, and `reload` through
  `NowPlayingDeps`; the controller itself stays DOM-free.

`PlayerBar` owns the bottom bar: now-playing title/artist/cover, play/pause labels and disabled
states, duration, seek value, and time labels. It reads the current track and playing state through
callbacks.

UNVERIFIED/POSSIBLY STALE: the conceptual fields `nowPlayingOpen` and
`libraryDirtyWhileNowPlaying` are currently implemented as the private `open` and `dirty` fields on
`NowPlayingController`, with `markDirty()` as the mutator. The described lifecycle behavior is
unchanged.

The source-menu and translation-toggle components are owned by
[renderer/lyric-source-menu.md](lyric-source-menu.md). The `Escape` priority order is in
[renderer/ui-map.md](ui-map.md).

## Playback abstraction (`src/renderer/player/engine.ts`)

`PlaybackEngine` exposes `load`, `play`, `pause`, `seek`, `setVolume`, `getPosition`, `getDuration`,
`isPlaying`, and typed `on` subscriptions for `ended`, `timeupdate`, `error`, `play`, `pause`, and
`loadedmetadata`.

`HtmlAudioEngine` wraps a single `<audio>` element:

- `load` sets `src` to the track URL.
- `seek` ignores non-finite values and clamps to ≥ 0.
- `setVolume` clamps to `[0, 1]`.
- `isPlaying` is `!paused && !ended`.
- The `error` listener ignores events with no media error (stale source), so replacing a track does
  not trigger a false failure.
- `on` returns an unsubscribe function.

The lyric view reads position only through this interface, never by reaching into the `<audio>`
element (invariant 9 in [TechnicalSpecs.md](../TechnicalSpecs.md)).

## Pure queue (`src/renderer/player/queue.ts`)

`PlaybackQueue` stores a copied track array and an index.

- `setQueue(tracks, startIndex)` clamps the index and returns the current track.
- `current`, `next`, `previous`, `hasNext`, `hasPrevious`, `getTracks`, `getCurrentIndex`.
- No playback, DOM, or persistence concerns.
