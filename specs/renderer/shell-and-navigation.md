# Renderer Shell, Navigation, and View Rendering

**Purpose:** the renderer composition root, DOM lookup, routing, toolbar state, library snapshot
handling, section choice, and the stateless view renderers.

**Owning source paths:** `src/renderer/src/main.ts`, `src/renderer/src/dom.ts`,
`src/renderer/src/routeStack.ts`, `src/renderer/src/navigation.ts`,
`src/renderer/src/toolbar.ts`, `src/renderer/src/libraryController.ts`,
`src/renderer/src/screen.ts`, `src/renderer/src/views/`, `src/renderer/src/format.ts`,
`src/renderer/library/artistTracks.ts`.

**Last verified:** 2026-11-08 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md) (invariants 8 and 10),
[renderer/library-query-and-lists.md](library-query-and-lists.md),
[renderer/playback.md](playback.md), [renderer/ui-map.md](ui-map.md),
[flows.md](../flows.md).

## Composition root (`src/renderer/src/main.ts`)

`main.ts` is deliberately composition-only. It:

- Looks up all DOM elements once through `getAppElements()`.
- Creates the `HtmlAudioEngine`, `PlaybackQueue`, `LyricsController`, `LyricView`, `PlayerBar`,
  `TracksList`, `QueuePanel`/`QueuePanelController`, `ContextMenu`, `ContextActions`, and `Toast`.
- Constructs every controller with explicit dependency interfaces and wires cross-controller calls
  through callbacks.
- Attaches menu triggers to album cards, artist rows, detail tracks, virtual track rows, queue rows,
  and the player-bar current-track target, and builds the matching menus.
- Subscribes to engine, library, lyric, queue, and queue-panel events, starts `library.initialize()`,
  and cleans up on `beforeunload`.
- `applySettings` restores volume, shuffle/repeat, view/sort, lyric preference, and translation
  settings without writing them back to disk.

It owns no routing, playback, search, queue-panel, menu, or rendering state; those live in the
controllers below. The queue panel and context-menu behavior are owned by
[renderer/queue-panel.md](queue-panel.md) and
[renderer/context-menu-and-toasts.md](context-menu-and-toasts.md).

UNVERIFIED/POSSIBLY STALE: the current `src/renderer/src/main.ts` is 335 lines. It remains
composition/wiring only, but the original “under 180 lines” claim no longer holds.

## Element lookup (`src/renderer/src/dom.ts`)

`getAppElements()` returns a typed `AppElements` object. It looks up every required element by id
once and throws `Missing element #<id>` immediately when the markup is incomplete.

## Pure route operations (`src/renderer/src/routeStack.ts`)

- `topRoute`, `pushRoute`, `popRoute`, and `pruneRoutes` are pure: they return new arrays and never
  mutate the input stack.
- `backLabel(activeView, stack)` chooses the Back button label from the parent route and view.
- Covered by `tests/routeStack.test.ts`.

## View and detail routing (`src/renderer/src/navigation.ts`)

Owns `activeView` and `detailStack`.

- `showSection(section)` hides every view except the given one.
- `currentSection()` returns the top detail view or the active library view.
- `openAlbum` / `openArtist` push routes; `goBack` pops; `switchView` resets the stack.
- `popRoute`, `resetStack`, and `pruneInvalidRoutes` let the screen and library controllers adjust
  routes without importing the navigation controller.
- `backLabel()` delegates to the pure `routeStack` helper.

## Toolbar (`src/renderer/src/toolbar.ts`)

Owns `sortByView`, `appliedSearch`, and the 150 ms search debounce.

- `applyUiSettings` validates persisted view/sort keys and selects defaults.
- `syncViewControls` updates `aria-pressed`, the sort options, and the selected value.
- `applySearch` closes Now Playing if necessary, re-renders the active library view, then restores
  the appropriate section.
- `Ctrl/Cmd+F` and `/` focus the search box; `Escape` clears it only after the context menu, source
  menu, queue panel, and Now Playing have had priority.
- `Q` toggles the queue panel when no text input has focus and no floating menu is open.
- Sort and view changes persist through the `saveUiState` callback.

The search/sort definitions and validators live in
[renderer/library-query-and-lists.md](library-query-and-lists.md). The keyboard map is in
[renderer/ui-map.md](ui-map.md).

## Library snapshot and scan state (`src/renderer/src/libraryController.ts`)

Owns `albums`, `libraryIndex`, `folderName`, and `libraryEventReceived`.

- `applySnapshot` replaces the snapshot/index, reconciles the queue through the transport interface,
  prunes invalid detail routes, marks Now Playing dirty, refreshes the screen, and updates
  status/controls.
- `openFolder` / `rescanLibrary` drive the scan buttons and progress label.
- `initialize` loads settings first, then `getState`; a `library:updated` event that arrives first
  wins. Loaded settings are applied through the composition root's `applySettings`.
- `start()` subscribes to scan progress and library updates and returns one disposer.
- `emptyMessage`, `updateStatus`, and `findAlbumForTrack` keep view text and cover lookup out of the
  renderers.

Startup ordering is summarized in [flows.md](../flows.md); scan-side behavior is in
[main/library-scanning.md](../main/library-scanning.md).

## Section choice and rendering (`src/renderer/src/screen.ts`)

`ScreenController.refresh()` syncs the toolbar controls, then:

- While Now Playing is open it shows the Now Playing section and leaves the hidden library DOM
  untouched, so closing restores scroll position.
- With a detail route it re-renders the hidden library view first (so Back restores search and sort),
  then shows and renders the album or artist detail.
- Otherwise it shows the active library section and renders it.

`renderLibraryView(view)` runs `queryLibrary` with the applied search and per-view sort and hands the
results to the matching view renderer. `updateTrackHighlight()` toggles the album-detail row highlight
and refreshes the virtualized tracks list.

## View renderers (`src/renderer/src/views/*`)

Each renderer takes data plus callbacks and owns no global state. Album cards, artist rows, track
lists, and detail tracks accept optional menu callbacks so the composition root can attach context
menus without giving the views menu state.

| File | Responsibility |
| --- | --- |
| `views/albumCards.ts` | Album card and card-grid DOM shared by albums and artist detail; optional card menu callback. |
| `views/albumGrid.ts` | Albums grid plus empty state; forwards the optional card menu callback. |
| `views/artistList.ts` | Artist rows with album/track counts plus empty state; optional row menu callback. |
| `views/tracksList.ts` | Virtualized tracks list; owns the visible track list used for queueing and takes an optional row menu callback. |
| `views/albumDetail.ts` | Album header with Play/Shuffle, cover/year, ordered track list, and optional track menu callback. |
| `views/artistDetail.ts` | Artist header with Play/Shuffle, counts, album grid, and optional card menu callback. |

`src/renderer/library/artistTracks.ts` holds the pure `getArtistTracks(artist)` helper used for
artist Play/Shuffle ordering (album year → title, then disc → track → title).

`src/renderer/src/format.ts` holds the shared `formatTime`, `smallCoverUrl`, `createCover`, and
`setCoverImage` DOM helpers.

UNVERIFIED/POSSIBLY STALE: `format.ts` also exports `attachCoverFallbacks`, used by `main.ts` to
install cover error fallbacks; the original §9.10 helper list did not mention it.

The virtual scroller itself is owned by
[renderer/library-query-and-lists.md](library-query-and-lists.md). Playback and Now Playing are owned
by [renderer/playback.md](playback.md). Markup and accessibility are owned by
[renderer/ui-map.md](ui-map.md).
