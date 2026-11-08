# Key Flows

**Purpose:** end-to-end sequences that cross process boundaries. Each step links to the module spec
that owns the detailed contract.

**Owning source paths:** cross-cutting; see the linked specs.

**Last verified:** 2026-11-06 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](TechnicalSpecs.md), [main/lifecycle-and-ipc.md](main/lifecycle-and-ipc.md),
[main/library-scanning.md](main/library-scanning.md), [renderer/playback.md](renderer/playback.md),
[renderer/lyrics-controller.md](renderer/lyrics-controller.md).

## Startup

1. Main registers the privileged `media` scheme.
2. Main loads settings and the library cache, then restores the cached snapshot for the last folder.
3. Main installs the media handler, IPC, and creates the window.
4. Preload exposes `window.library`.
5. Renderer subscribes to library events, loads settings, applies view/sort plus persisted
   shuffle/repeat, then calls `getState`.
6. `getState` triggers a one-time background refresh; the cached library is already visible.
7. When the refresh finishes, `library:updated` replaces the snapshot and the UI re-renders.

Details: [main/lifecycle-and-ipc.md](main/lifecycle-and-ipc.md),
[main/library-scanning.md](main/library-scanning.md),
[renderer/shell-and-navigation.md](renderer/shell-and-navigation.md).

## Open folder / rescan

1. Renderer disables scan buttons and calls `openFolder()`/`rescan()`.
2. Main shows the dialog (open only), canonicalizes the path, and scans.
3. Main streams throttled progress events.
4. On completion, main applies the snapshot, writes the cache, optionally persists the folder, and
   returns the snapshot.
5. Renderer applies the snapshot, reconciles the queue, refreshes views, and re-enables controls.
6. Cancelling the folder dialog returns `null`; the renderer re-enables controls and leaves the
   current view (including Now Playing) untouched.

Details: [main/library-scanning.md](main/library-scanning.md),
[renderer/shell-and-navigation.md](renderer/shell-and-navigation.md).

## Track start and playback

1. Clicking a track queues either the album or the visible track list and sets the index; the queue
   records an album, artist, tracks, or search context. Album/artist headers can also Play or Shuffle
   the whole collection.
2. `startCurrentTrack` loads the URL, calls `lyricsController.setTrack(track.id)`, resets time UI,
   updates Now Playing/highlight, and starts playback.
3. Engine events update controls, time labels, and duration. On `ended`, repeat-one restarts the
   current track, repeat-all wraps, and otherwise playback advances or stops.
4. A failed `play()` or media error skips to the next track until one failure per queue entry has
   been reached; `AbortError` is ignored.
5. If the library refresh removes the current track, `reconcileQueue` resets playback.

Details: [renderer/playback.md](renderer/playback.md).

## Lyric load and display

1. `setTrack` checks the LRU cache; a hit applies immediately.
2. A miss sets `loading` and invokes `lyrics:get-sources`.
3. Main resolves the path from the library index, reads embedded tags and same-directory sidecars,
   and returns ordered `LyricSources` or `null`.
4. The renderer parses every available option, picks one with the saved-choice / preference rules,
   and caches the whole source entry.
5. If Now Playing is open, the controller subscription renders the new state:
   - `ready` → build/sync the document and start the frame loop,
   - `loading` → “Loading lyrics…”,
   - `none` → “No lyrics found”.
6. Responses for tracks that are no longer current are discarded by the generation check.

Details: [main/lyric-sources.md](main/lyric-sources.md),
[renderer/lyrics-controller.md](renderer/lyrics-controller.md),
[renderer/lyric-view.md](renderer/lyric-view.md).

## Now Playing open/close

1. Clicking the bottom-bar cover/title (or pressing Enter/Space on it) opens Now Playing.
2. `showSection` displays only the Now Playing view; the player bar stays visible.
3. The hidden library DOM is not re-rendered, preserving scroll/search/view.
4. If a library snapshot arrives while open, `libraryDirtyWhileNowPlaying` is set and the screen stays
   on Now Playing.
5. The close button or `Escape` closes it; if the library changed, the screen re-renders, otherwise the
   previous section is shown exactly as it was.
6. Navigating (open album/artist, back, switch view, search, open folder) closes Now Playing first.

Details: [renderer/playback.md](renderer/playback.md),
[renderer/shell-and-navigation.md](renderer/shell-and-navigation.md),
[renderer/ui-map.md](renderer/ui-map.md).

UNVERIFIED/POSSIBLY STALE: step 4 names `libraryDirtyWhileNowPlaying`, which is the conceptual flag.
The current implementation stores it as the private `dirty` field on `NowPlayingController` and
exposes `markDirty()`; the behavior described is unchanged.
