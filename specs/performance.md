# Performance Characteristics

**Purpose:** the mechanisms that keep scans, list rendering, and lyric synchronization cheap. Exact
limits and constants are owned by the module specs linked below; this file records the performance
intent without duplicating volatile values.

**Owning source paths:** cross-cutting; see linked specs.

**Last verified:** 2026-11-08 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](TechnicalSpecs.md), [main/library-scanning.md](main/library-scanning.md),
[main/covers-and-media.md](main/covers-and-media.md),
[renderer/library-query-and-lists.md](renderer/library-query-and-lists.md),
[renderer/lyrics-controller.md](renderer/lyrics-controller.md),
[renderer/lyric-view.md](renderer/lyric-view.md),
[renderer/queue-panel.md](renderer/queue-panel.md),
[renderer/favorites.md](renderer/favorites.md),
[testing-and-verification.md](testing-and-verification.md).

- **Tag reads:** bounded concurrency, owned by
  [main/library-scanning.md](main/library-scanning.md).
- **Cache reuse:** unchanged files are not parsed again; reuse is keyed by `mtimeMs` + `size` and is
  owned by [main/library-scanning.md](main/library-scanning.md) and
  [persistence.md](persistence.md).
- **Progress events:** throttled to one per fixed interval, with the final event always sent; owned
  by [main/library-scanning.md](main/library-scanning.md).
- **Covers:** full and small JPEGs are cached; the small variant is derived from the full cover; and
  in-flight requests are deduplicated. Sizes and quality are owned by
  [main/covers-and-media.md](main/covers-and-media.md).
- **Track list:** virtualized; only visible rows plus an overscan buffer exist in the DOM. Row height
  and overscan are owned by [renderer/library-query-and-lists.md](renderer/library-query-and-lists.md).
- **Library queries:** the index is built once per snapshot; each keystroke only filters and sorts.
  See [renderer/library-query-and-lists.md](renderer/library-query-and-lists.md).
- **Lyrics:** fetched on demand; parsed source entries are cached with an LRU limit; one rAF loop runs
  while the view is visible. See [renderer/lyrics-controller.md](renderer/lyrics-controller.md) and
  [renderer/lyric-view.md](renderer/lyric-view.md).
- **Queue panel:** the same fixed-row virtual scroller renders one flat row list, so a 2000+ entry
  queue keeps a bounded DOM. Snapshot updates preserve the scroll offset; only opening the panel
  scrolls the current entry into view. Drag auto-scroll adjusts `scrollTop` once per animation frame.
  See [renderer/queue-panel.md](renderer/queue-panel.md).
- **Session writes:** the renderer debounces queue payloads by ~1 s and sends position at most every
  ~5 s while playing; main writes the queue only when it changes and throttles position writes to
  1 s, so a large queue is never rewritten for position updates. See
  [main/window-and-session.md](main/window-and-session.md).
- **Shortcuts and Media Session:** matching is a small table scan per keydown; the overlay is built
  once. Media Session position updates happen on events (track change, metadata, play/pause, seek),
  not every frame. See [renderer/shortcuts.md](renderer/shortcuts.md).
- **LyrixData:** browsing reads no files until the Favorites view asks for state; the first write
  creates the folder. Favorites mutations are read-modify-write on a small file, ref resolution is
  built once per library snapshot, and the Favorites view uses the same fixed-row virtual list. See
  [main/lyrixdata.md](main/lyrixdata.md).
- **Lyric DOM:** built once per document; each frame reads the position once, runs the binary
  searches, and does one O(lines) flag pass whose DOM writes happen only for changed state. See
  [renderer/lyric-view.md](renderer/lyric-view.md).
- **Auto-scroll:** one smooth scroll per primary-line change; manual scrolling pauses it for a fixed
  window owned by [renderer/lyric-view.md](renderer/lyric-view.md).
- **Cover images:** lazy-loaded/async-decoded where applicable; see
  [renderer/shell-and-navigation.md](renderer/shell-and-navigation.md) and
  [renderer/library-query-and-lists.md](renderer/library-query-and-lists.md).

The invariant that drives all of this is invariant 10 in [TechnicalSpecs.md](TechnicalSpecs.md):
UI updates are minimal, and virtual rows / lyric lines update only when their state changes.
