# Library Query and Virtual Lists

**Purpose:** the pure library index/search/sort registry and the fixed-row virtual scroller used by
the tracks view.

**Owning source paths:** `src/renderer/library/query.ts`, `src/renderer/ui/virtualList.ts`.

**Last verified:** 2026-11-06 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md) (invariants 8 and 10),
[renderer/shell-and-navigation.md](shell-and-navigation.md),
[performance.md](../performance.md), [testing-and-verification.md](../testing-and-verification.md).

## Pure index, views, search, sort (`src/renderer/library/query.ts`)

- `normalizeText` strips diacritics, lowercases, trims, and collapses whitespace.
- `filterBySearch` requires **every** query word to appear in the item's precomputed `searchText`.
- `VIEWS` is the registry for albums, artists, and tracks:
  - Each view has a label, default sort, sort map, and item builder.
  - Albums: title, artist, year.
  - Artists: name, track count.
  - Tracks: title, artist, album.
- `buildLibraryIndex(albums)` precomputes items for all views once per snapshot.
- `queryLibrary(index, { view, search, sort })` filters and sorts without touching the DOM.
- `getViewIds`, `getSortOptions`, `getDefaultSort`, `isLibraryView`, `isSortKey` support the UI and
  validate persisted values.
- Artists are grouped by the exact album-artist string; no multi-artist splitting.

The persisted view/sort values that these helpers validate are written by the toolbar
([renderer/shell-and-navigation.md](shell-and-navigation.md)) and normalized by
[persistence.md](../persistence.md). The test coverage for every view, sort key, and exact-artist
grouping is listed in [testing-and-verification.md](../testing-and-verification.md).

## Fixed-row virtual scroller (`src/renderer/ui/virtualList.ts`)

- Builds a spacer with the full height and an absolutely positioned window inside it.
- Renders only the visible rows plus an overscan buffer (default 4) above and below.
- Re-renders on scroll via `requestAnimationFrame` and on container resize via `ResizeObserver`.
- `setItems` resets scroll and invalidates; `refresh` re-renders the current window (used when the
  playing highlight changes); `destroy` removes listeners and DOM.
- Used only by the tracks view, with 52 px rows.

The tracks view renderer that supplies rows is owned by
[renderer/shell-and-navigation.md](shell-and-navigation.md). The scrolling/animation budget is
summarized in [performance.md](../performance.md).
