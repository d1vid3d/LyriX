# Renderer Shell, Navigation, and View Rendering

**Purpose:** the renderer composition root, DOM lookup, routing, toolbar state, library snapshot
handling, section choice, and the stateless view renderers.

**Owning source paths:** `src/renderer/src/main.ts`, `src/renderer/src/dom.ts`,
`src/renderer/src/routeStack.ts`, `src/renderer/src/navigation.ts`,
`src/renderer/src/toolbar.ts`, `src/renderer/src/libraryController.ts`,
`src/renderer/src/screen.ts`, `src/renderer/src/views/`, `src/renderer/src/format.ts`.

**Last verified:** 2026-11-06 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md) (invariants 8 and 10),
[renderer/library-query-and-lists.md](library-query-and-lists.md),
[renderer/playback.md](playback.md), [renderer/ui-map.md](ui-map.md),
[flows.md](../flows.md).

## Composition root (`src/renderer/src/main.ts`)

`main.ts` is deliberately thin (under 180 lines, composition only). It:

- Looks up all DOM elements once through `getAppElements()`.
- Creates the `HtmlAudioEngine`, `PlaybackQueue`, `LyricsController`, `LyricView`, `PlayerBar`, and
  the tracks `TracksList`.
- Constructs every controller with explicit dependency interfaces and wires cross-controller calls
  through callbacks.
- Subscribes to engine, library, and lyric events, starts `library.initialize()`, and cleans up on
  `beforeunload`.

It owns no routing, playback, search, or rendering state; those live in the controllers below.

UNVERIFIED/POSSIBLY STALE: the current `src/renderer/src/main.ts` is 203 lines, not under 180.
The “composition only” description still matches the code; only the line-count claim is stale.

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
- `Ctrl/Cmd+F` and `/` focus the search box; `Escape` clears it (Now Playing `Escape` takes
  priority).
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
  wins.
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

Each renderer takes data plus callbacks and owns no global state:

| File | Responsibility |
| --- | --- |
| `views/albumCards.ts` | Album card and card-grid DOM shared by albums and artist detail. |
| `views/albumGrid.ts` | Albums grid plus empty state. |
| `views/artistList.ts` | Artist rows with album/track counts plus empty state. |
| `views/tracksList.ts` | Virtualized tracks list; owns the visible track list used for queueing. |
| `views/albumDetail.ts` | Album header, cover/year, and ordered track list. |
| `views/artistDetail.ts` | Artist header and album grid. |

`src/renderer/src/format.ts` holds the shared `formatTime`, `smallCoverUrl`, `createCover`, and
`setCoverImage` DOM helpers.

UNVERIFIED/POSSIBLY STALE: `format.ts` also exports `attachCoverFallbacks`, used by `main.ts` to
install cover error fallbacks; the original §9.10 helper list did not mention it.

The virtual scroller itself is owned by
[renderer/library-query-and-lists.md](library-query-and-lists.md). Playback and Now Playing are owned
by [renderer/playback.md](playback.md). Markup and accessibility are owned by
[renderer/ui-map.md](ui-map.md).
