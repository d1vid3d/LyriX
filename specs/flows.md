# Key Flows

**Purpose:** end-to-end sequences that cross process boundaries. Each step links to the module spec
that owns the detailed contract.

**Owning source paths:** cross-cutting; see the linked specs.

**Last verified:** 2026-11-08 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](TechnicalSpecs.md), [main/lifecycle-and-ipc.md](main/lifecycle-and-ipc.md),
[main/window-and-session.md](main/window-and-session.md), [main/lyrixdata.md](main/lyrixdata.md),
[main/library-scanning.md](main/library-scanning.md), [renderer/playback.md](renderer/playback.md),
[renderer/shortcuts.md](renderer/shortcuts.md), [renderer/favorites.md](renderer/favorites.md),
[renderer/queue-panel.md](renderer/queue-panel.md),
[renderer/context-menu-and-toasts.md](renderer/context-menu-and-toasts.md),
[renderer/lyrics-controller.md](renderer/lyrics-controller.md).

## Startup

1. Main registers the privileged `media` scheme and checks the single-instance lock; a second launch
   focuses the existing window and exits.
2. Main loads settings and the library cache, then restores the cached snapshot for the last folder.
3. Main loads the machine id, binds LyrixData for the root, and resolves favorites without creating
   any files.
4. Main loads the saved window bounds, loads the resume session when its folder matches, installs the
   media handler, registers IPC, and creates the window.
5. Preload exposes `window.library`.
6. Renderer subscribes to library events, loads settings, applies view/sort plus persisted
   shuffle/repeat, then calls `getState`.
7. `getState` triggers a one-time background refresh; the cached library is already visible.
8. When the refresh finishes, `library:updated` replaces the snapshot; main rebinds LyrixData and
   re-resolves favorites, then the UI re-renders.
9. The renderer loads status/favorites and calls `session:get`. If a session exists, it imports the
   queue, loads the current track, seeks to the saved position once metadata arrives, and leaves it
   paused. Session writes start only after this restore.

Details: [main/lifecycle-and-ipc.md](main/lifecycle-and-ipc.md),
[main/window-and-session.md](main/window-and-session.md),
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

## Queue panel and context-menu actions

1. The player-bar Queue button or `Q` toggles the slide-over. The controller rebuilds the pure row
   model from the latest snapshot, and the panel virtualizes the flat current/upcoming/history rows.
   Opening scrolls the current row into view; later snapshot updates keep the scroll offset.
2. Row intents are translated by the controller: play (double-click/Enter) jumps and starts,
   remove calls `queue.remove` (the current row is refused), and drag/Alt+Arrow reordering calls
   `queue.move` with a post-removal destination.
3. Right-click or `Shift+F10` on a track, album, artist, queue row, or the current-track target opens
   one context menu. Opening it closes the lyric source menu; selecting an item closes the menu and
   dispatches through `ContextActions`.
4. Play next / add to queue with no current entry starts the first added track immediately; otherwise
   the entries are inserted after the current entry or appended.
5. Go to album/artist validates the target and navigates through the normal route stack, which closes
   Now Playing; a missing target shows a toast instead.
6. Show in file manager sends only the track id over IPC. Main resolves, canonicalizes, and validates
   the path before revealing it; a `false` result shows a toast.
7. Each toast replaces the previous one and auto-dismisses; toasts never take focus.

Details: [renderer/queue-panel.md](renderer/queue-panel.md),
[renderer/context-menu-and-toasts.md](renderer/context-menu-and-toasts.md).

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

## Favorite toggle and LyrixData

1. A heart, context menu, or `F` calls the renderer `FavoritesController`, which updates state
   optimistically and sends only track ids over `favorites:set`.
2. Main validates the ids, converts them to portable refs through the current snapshot, re-reads
   `favorites.json`, applies the change, heals relinked refs, and writes through the serialized store.
   The first write creates `LyrixData/` with `README.txt`, `library.json`, and `favorites.json`.
3. Main emits `favorites:changed`; the renderer replaces its state, updates every visible heart, and
   re-renders the Favorites view.
4. Browsing, scanning, and opening a library never create LyrixData. A blocked write (read-only,
   unavailable, newer-version) rolls the optimistic state back and opens the disclaimer; Retry
   re-detects the folder, closes on success, and re-runs the pending action once.

Details: [main/lyrixdata.md](main/lyrixdata.md),
[renderer/favorites.md](renderer/favorites.md).

## Session save, shortcuts, and media keys

1. While playing, the renderer debounces queue changes by ~1 s and sends position at most every ~5 s;
   pause, seek end, and track change send immediately. Main validates, folder-stamps, throttles the
   position write, and flushes both files on quit.
2. Global shortcuts go through one registry-driven listener. Typing and native activation targets win
   over plain keys; modified shortcuts still work while typing. Escape closes exactly one layer in the
   priority order owned by [renderer/shortcuts.md](renderer/shortcuts.md).
3. Media Session metadata/playback state/position follow the current queue and engine; hardware keys
   and the Windows overlay use that route, with a disabled global-shortcut fallback.

Details: [main/window-and-session.md](main/window-and-session.md),
[renderer/shortcuts.md](renderer/shortcuts.md).

## Now Playing open/close

1. Clicking the bottom-bar cover/title (or pressing Enter/Space on it) opens Now Playing.
2. `showSection` displays only the Now Playing view; the player bar stays visible.
3. The hidden library DOM is not re-rendered, preserving scroll/search/view.
4. If a library snapshot arrives while open, `libraryDirtyWhileNowPlaying` is set and the screen stays
   on Now Playing.
5. Once no context menu, source menu, or queue panel is open, the close button or `Escape` closes
   Now Playing; if the library changed, the screen re-renders, otherwise the previous section is
   shown exactly as it was.
6. Navigating (open album/artist, back, switch view, search, open folder) closes Now Playing first.

Details: [renderer/playback.md](renderer/playback.md),
[renderer/queue-panel.md](renderer/queue-panel.md),
[renderer/context-menu-and-toasts.md](renderer/context-menu-and-toasts.md),
[renderer/shell-and-navigation.md](renderer/shell-and-navigation.md),
[renderer/ui-map.md](renderer/ui-map.md).

UNVERIFIED/POSSIBLY STALE: step 4 names `libraryDirtyWhileNowPlaying`, which is the conceptual flag.
The current implementation stores it as the private `dirty` field on `NowPlayingController` and
exposes `markDirty()`; the behavior described is unchanged.
