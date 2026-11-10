# Playback, Transport, Now Playing, and Player Bar

**Purpose:** the renderer's playback state machine: queue, engine adapter, transport controls,
Now Playing lifecycle, and the bottom bar.

**Owning source paths:** `src/renderer/src/transport.ts`, `src/renderer/src/nowPlaying.ts`,
`src/renderer/src/playerBar.ts`, `src/renderer/player/engine.ts`,
`src/renderer/player/transportDecisions.ts`, `src/renderer/player/queue/`.

**Last verified:** 2026-11-10 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md) (invariants 9 and 10),
[renderer/shell-and-navigation.md](shell-and-navigation.md),
[renderer/lyrics-controller.md](lyrics-controller.md),
[renderer/lyric-source-menu.md](lyric-source-menu.md), [flows.md](../flows.md).

## Transport (`src/renderer/src/transport.ts`)

Owns the `PlaybackQueue`, the engine subscriptions, `isSeeking`, `activeAttempt`, and
`consecutiveFailures`.

- `playQueue(tracks, index, context)` sets the queue with a `QueueContext`; clicking the
  already-current track and index resumes instead of reloading.
- `playAlbumTrack` queues the album in album order; `playAlbum` starts it from the first track;
  `shuffleAlbum` enables shuffle and starts from a random index.
- `playArtist` queues `getArtistTracks(artist)` (album year → title, then disc → track → title);
  `shuffleArtist` enables shuffle and starts from a random index.
- `playVisibleTrack` queues the visible track list with a `tracks` context, or a `search` context
  carrying the applied search text. The Favorites header uses `shuffleTracks` with a `favorites`
  context.
- `startCurrentTrack` loads the track, requests lyrics, resets time UI, optionally plays, and
  updates Now Playing/highlight/controls.
- `toggleShuffle` flips the queue shuffle flag; `cycleRepeat` moves `off → all → one → off`. Both
  save the combined playback settings through the renderer's `savePlaybackSettings` callback.
- `handleEnded` advances and either plays, restarts the current track for repeat-one, or stops.
- `handlePlaybackFailure` ignores `AbortError`, skips forward when possible, caps consecutive
  failures at one per queue entry, and otherwise pauses.
- `previous` restarts the track when position > 3 s, otherwise moves back.
- `reconcileQueue` rebuilds the queue from current track ids and resets playback when the current
  track disappeared.
- `resetPlayback` clears the queue, pauses the engine, clears lyrics, and resets the UI.
- `restoreSession(state, position)` imports the queue by track id, loads the current track, applies
  the saved position once metadata arrives, and never autoplays.
- Engine events also feed the pure `PlayTracker` (`play`, `pause`, `timeupdate`, `ended`, `error`);
  restore stays paused so it never counts. Rules live in [main/history.md](../main/history.md).
- Public shortcut/media entry points: `playPause`, `play`, `pause`, `nextTrack`, `previousTrack`,
  `seekBy`, `seekTo`, and `adjustVolume` (which saves exactly like the volume slider).
- Seek bar, volume, and engine event wiring live here. Finishing a seek calls the injected
  `onSeekEnd` hook so the session and Media Session position can be saved immediately. `start()`
  subscribes to engine events and returns one disposer.

The visible track list comes from the tracks view ([renderer/shell-and-navigation.md](shell-and-navigation.md));
lyric loading is started through [renderer/lyrics-controller.md](lyrics-controller.md). The session
timing/restore flow is owned by [main/window-and-session.md](../main/window-and-session.md) and
[renderer/shortcuts.md](shortcuts.md).

## Pure transport decisions (`src/renderer/player/transportDecisions.ts`)

DOM-free helpers used by the transport:

- `decideEndedAction(current, next)` → `stop` when there is no next entry, `restart` when the queue
  returned the same entry (repeat-one replay), otherwise `play`.
- `decidePreviousAction(position, previous)` → `restart` above 3 s, otherwise `play` the previous
  entry, falling back to `restart`.
- `decideFailureAction(entryCount, consecutiveFailures)` → `skip` until the failure count reaches
  the entry count, then `stop`, so repeat-all cannot loop forever over a fully broken queue.
- `nextRepeatMode(mode)` cycles `off → all → one → off`.

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
states, shuffle/repeat state, queue toggle state, duration, seek value, and time labels. It reads the
current track, playing state, queue snapshot, next/previous availability, and queue-panel open state
through callbacks.

- Shuffle sets `aria-pressed` and a `Shuffle: on|off` label/title.
- Repeat sets `aria-pressed` (true for `all` and `one`), a `Repeat: <mode>` label/title, and
  `data-repeat`; the inline badge is shown only for `one`.
- The Queue toggle sets `aria-pressed` and `aria-expanded` from the panel's open state.

The visible queue panel, its row model, and reordering are owned by
[renderer/queue-panel.md](queue-panel.md).

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

## Editable queue (`src/renderer/player/queue/`)

`PlaybackQueue` is pure: it imports only track/album types and the shuffle helpers, and has no
playback, DOM, or persistence concerns. The folder exports `PlaybackQueue`, the queue types, and
the shuffle helpers.

- `QueueEntry` carries `entryId` (stable per insertion), `track`, and `origin`
  (`context | playNext | added`). `QueueContext` is
  `{ kind: album | artist | tracks | search | favorites | other, label }`.
- `getSnapshot()` returns a frozen, memoized `QueueSnapshot` (`entries`, `currentIndex`, `current`,
  `shuffle`, `repeat`, `context`, `version`). The snapshot is rebuilt and `version` increments only
  after a mutation; `subscribe(listener)` returns an unsubscribe function.
- `setQueue(tracks, startIndex, { context })` clamps the start index (non-finite/fractional values
  normalize to 0/truncation). With shuffle on it keeps the requested start track first and shuffles
  the rest.
- `advance(reason)` and `peekNext(reason)` honor repeat-one only for `ended`. `peekNext` wraps to the
  first entry for repeat-all and caches the shuffled wrap order so a following `advance` returns the
  same entry.
- `previous()` moves back, wrapping to the last entry for repeat-all; at the start without repeat it
  returns `null`. `canGoNext` follows the advance wrap rule; `canGoPrevious` is true whenever the
  queue is non-empty, so the transport can restart the first track instead of disabling the button.
- `playNext(tracks)` inserts directly after the current entry and after any existing `playNext`
  entries; `addToQueue(tracks)` appends. Both assign fresh entry ids.
- `remove(entryId)` refuses the current entry; `move(entryId, toIndex)` clamps the destination and
  keeps the current entry selected; `jumpTo(entryId)` selects any entry.
- `clearUpcoming()` removes everything after the current entry; `clear()` empties the queue and
  context.
- `setShuffle(enabled)` shuffles only the entries after the current one; earlier history stays in
  place. Turning shuffle off rebuilds `originalOrder` with the current entry re-anchored at its
  natural position, so the next track is the current track's natural successor (not a track that
  originally came before it). Added/play-next entries stay at their recorded original positions.
  Manual reordering while shuffled is intentionally not preserved.
- `setRepeat(mode)` normalizes unknown values to `off`.
- `reconcile(trackLookup)` drops entries whose ids no longer resolve, returns the current entry when
  it survived, and clears the queue when it did not.
- `exportState()` returns a plain-JSON, id-only `SessionQueueState` (play order, natural order,
  current entry id, context). `importState(state, trackLookup)` validates defensively, drops entries
  whose tracks are gone, restarts at the first survivor when the current entry vanished, rebuilds the
  natural order and entry counter, and never reshuffles.
- The constructor accepts an injectable RNG (`QueueRandom`) for deterministic shuffle tests; it
  defaults to `Math.random`.

Shuffle helpers in `shuffle.ts` perform a Fisher-Yates copy (never mutating the input) and avoid
replaying the just-played track as the first wrap entry when another track exists.
