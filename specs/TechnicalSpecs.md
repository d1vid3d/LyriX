# LyriX — Technical Specification Index

> Status: as-built reference for LyriX 0.1.0. This document describes what the code currently does,
> where responsibilities live, and how to extend it safely. It is intentionally separate from the
> user-facing `README.md`.

**Purpose:** entry point for every contributor and agent. Load this file first, then only the spec
files relevant to the task.

**Last verified:** 2026-11-08 against LyriX 0.1.0 (`src/`, `tests/`, `package.json`).

## Summary

LyriX is a minimal desktop player for local FLAC libraries built with **Electron**, **electron-vite**,
**TypeScript**, and plain **HTML/CSS**. It has no UI framework, no runtime state library, and no
dependencies beyond `music-metadata` (main process) plus the Electron/Vite/Vitest toolchain.

> UNVERIFIED/POSSIBLY STALE: the dependency summary above omits the Electron Forge toolchain and the
> `package`/`make` scripts that exist in `package.json` and `forge.config.js`. See
> [build-and-config.md](build-and-config.md) and [known-limitations.md](known-limitations.md).

Architecture in one line: **the main process owns the filesystem, tags, covers, persistence, and the
`media://` protocol; the preload exposes a small typed bridge; the renderer owns all UI, playback
state, and lyric presentation.**

Capabilities, design goals, process boundaries, and the reduced module map live in
[architecture.md](architecture.md).

## Invariants

Every agent should always load this list. Module specs reference these numbers instead of restating
them.

1. **Renderer never sees real file paths.** It receives track and album ids plus `media://` URLs.
2. **Main process validates every id and every path.** Track paths are looked up from the scanned
   library, never accepted from the renderer.
3. **`media://` enforces path containment** using `realpath` + relative-path checks, and only serves
   regular `.flac` files or cached cover JPEGs.
4. **Lyrics are on-demand only.** They are not read during scan and not stored in the library cache.
5. **Lyric source IPC never throws across the boundary.** Invalid ids, missing files, and parse
   failures resolve to `null`; choice writes validate their input and no-op on failure.
6. **Disk writes are atomic.** Settings, library cache, lyric choices, and cover files use
   temp-file + rename.
7. **Scans are cancellable.** A generation counter makes stale scans stop reporting and never
   overwrite newer state.
8. **Persisted values are validated** by the main process before use, and again by the renderer for
   view/sort keys.
9. **The renderer reads playback position only through `PlaybackEngine`**, never by reaching into the
   `<audio>` element for lyric sync.
10. **UI updates are minimal.** Virtual rows and lyric lines update only when their state changes.
11. **Sidecar reads stay inside the track's directory.** Only regular files are read; symlinks,
    directories, and files over 1 MiB are skipped.

## Routing: if you are changing X, read Y

| If you are changing… | Read |
| --- | --- |
| Process boundaries, design goals, module responsibilities | [architecture.md](architecture.md) |
| Build scripts, TypeScript projects, bundler, CSP/security flags | [build-and-config.md](build-and-config.md) |
| Cross-process types, track/album ids, `LibraryApi` surface | [data-model.md](data-model.md) |
| Settings, library cache, lyric choices, atomic JSON writes | [persistence.md](persistence.md) |
| App startup, window, `AppStore`, IPC handlers, preload bridge | [main/lifecycle-and-ipc.md](main/lifecycle-and-ipc.md) |
| Folder walking, tag reads, album grouping, scan generation/progress | [main/library-scanning.md](main/library-scanning.md) |
| Cover extraction/resizing/cache, `media://` and byte ranges | [main/covers-and-media.md](main/covers-and-media.md) |
| Embedded lyric tags, sidecar discovery/decoding, provider order | [main/lyric-sources.md](main/lyric-sources.md) |
| Composition root, DOM lookup, routing, toolbar, snapshot, screen, views | [renderer/shell-and-navigation.md](renderer/shell-and-navigation.md) |
| Library index, search, sort registry, virtual track list | [renderer/library-query-and-lists.md](renderer/library-query-and-lists.md) |
| Transport, Now Playing lifecycle, player bar, engine, queue model | [renderer/playback.md](renderer/playback.md) |
| Visible queue panel, row model, drag/keyboard reorder, queue toggle | [renderer/queue-panel.md](renderer/queue-panel.md) |
| Right-click menus, menu actions, toasts, reveal-in-file-manager | [renderer/context-menu-and-toasts.md](renderer/context-menu-and-toasts.md) |
| Lyric fetch/select/cache, translation state, word grouping | [renderer/lyrics-controller.md](renderer/lyrics-controller.md) |
| Lyric DOM, rAF sync, scrolling, seek, translation children | [renderer/lyric-view.md](renderer/lyric-view.md) |
| Source-menu models, popover DOM, keyboard/ARIA, quick toggle | [renderer/lyric-source-menu.md](renderer/lyric-source-menu.md) |
| Lyric, Now Playing, and source-menu styling | [renderer/styles.md](renderer/styles.md) |
| Markup, keyboard map, element ids, accessibility | [renderer/ui-map.md](renderer/ui-map.md) |
| Lyric parsing, timestamps, alignment, sync helpers | [shared-lyric-core.md](shared-lyric-core.md) |
| Startup, scan, playback, lyric-load, Now Playing flows | [flows.md](flows.md) |
| Path containment, IPC validation, robustness rules | [security-and-robustness.md](security-and-robustness.md) |
| Concurrency, caching, virtualization, per-frame cost | [performance.md](performance.md) |
| Tests, fixtures, commands, pre-merge checks | [testing-and-verification.md](testing-and-verification.md) |
| Recipes: add a lyric source / view / sort / backend / setting | [extension-guide.md](extension-guide.md) |
| Current scope limits and deliberate omissions | [known-limitations.md](known-limitations.md) |

For exact file lists, imports, and call graphs, use **graphify** (`graphify query`,
`graphify path`, `graphify explain`) instead of re-reading this spec. The specs carry intent and
contracts that the graph cannot.

## Maintaining these specs

- **The code wins over the specs.** When behavior changes, update the one spec file that owns it in
  the same change.
- **Agents** read this index first, then load only the spec files relevant to the task, and use
  graphify for structural questions.
- **One fact lives in exactly one file.** Link between files instead of duplicating.
- **Volatile verification numbers** (test counts, file counts) appear only in
  [testing-and-verification.md](testing-and-verification.md); every other file links to it.
- **Do not turn these files into a file tree.** Structural facts belong to graphify; keep the
  one-line responsibility of each module, not its import list.
- **Preserve the as-built character.** No decision log, roadmap, or rationale that the original
  spec did not contain.
- **Never edit** `_archive/TechnicalSpecs.original.md`.

## Spec files

| File | One-line description |
| --- | --- |
| [architecture.md](architecture.md) | Goals, capabilities, process diagram, process boundaries, reduced module responsibilities. |
| [build-and-config.md](build-and-config.md) | npm scripts, TypeScript projects, electron-vite behavior, renderer security settings. |
| [data-model.md](data-model.md) | Shared types, settings/snapshot shapes, SHA-1 id contract. |
| [persistence.md](persistence.md) | On-disk layout, settings normalization, library cache, lyric-choice store, atomic JSON helpers. |
| [main/lifecycle-and-ipc.md](main/lifecycle-and-ipc.md) | App startup, window, shared store, IPC channels, preload `window.library`. |
| [main/library-scanning.md](main/library-scanning.md) | Folder walk, tag fallbacks, album grouping, scan coordinator. |
| [main/covers-and-media.md](main/covers-and-media.md) | Cover extraction/resizing/cache, `media://` track/cover serving, ranges. |
| [main/lyric-sources.md](main/lyric-sources.md) | Embedded tags, sidecar discovery/decoding, canonical provider list. |
| [renderer/shell-and-navigation.md](renderer/shell-and-navigation.md) | Composition root, DOM lookup, route stack, navigation, toolbar, library state, screen, view renderers. |
| [renderer/library-query-and-lists.md](renderer/library-query-and-lists.md) | Pure view/sort/search registry and the fixed-row virtual scroller. |
| [renderer/playback.md](renderer/playback.md) | Transport, queue model, engine, Now Playing, player bar. |
| [renderer/queue-panel.md](renderer/queue-panel.md) | Visible queue panel, pure row model, drag/keyboard reordering, queue toggle. |
| [renderer/context-menu-and-toasts.md](renderer/context-menu-and-toasts.md) | Generic context menu, menu builders/actions, toasts, reveal IPC path. |
| [renderer/lyrics-controller.md](renderer/lyrics-controller.md) | Lyric source fetch/parse/select/state/LRU cache, translation state, word grouping. |
| [renderer/lyric-view.md](renderer/lyric-view.md) | Lyric DOM construction, rAF synchronization, auto-scroll, line seek. |
| [renderer/lyric-source-menu.md](renderer/lyric-source-menu.md) | Source/translation menu models, popover, keyboard/ARIA, quick toggle. |
| [renderer/styles.md](renderer/styles.md) | Theme, lyric, and source-menu CSS variables and visual rules. |
| [renderer/ui-map.md](renderer/ui-map.md) | Markup sections, keyboard map, accessibility details. |
| [shared-lyric-core.md](shared-lyric-core.md) | Pure lyric types, parsers, timing, translation alignment, sync helpers. |
| [flows.md](flows.md) | End-to-end startup, scan, playback, lyric-load, and Now Playing flows. |
| [security-and-robustness.md](security-and-robustness.md) | Isolation, containment, validation, tolerant persistence, failure isolation. |
| [performance.md](performance.md) | Concurrency, caching, virtualization, and per-frame cost characteristics. |
| [testing-and-verification.md](testing-and-verification.md) | Test coverage map, fixtures, commands, verification checklist. |
| [extension-guide.md](extension-guide.md) | Recipes for adding a lyric source, library view, sort option, playback backend, or persisted setting. |
| [known-limitations.md](known-limitations.md) | Non-goals and current limitations. |
