# Architecture and Module Responsibilities

**Purpose:** design goals, current capabilities, process boundaries, and the one-line responsibility
of every module. Exact imports and call graphs belong to graphify, not to this file.

**Owning source paths:** `src/main/`, `src/preload/`, `src/renderer/`, `src/shared/`.

**Last verified:** 2026-11-08 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](TechnicalSpecs.md) (invariants), [build-and-config.md](build-and-config.md),
[data-model.md](data-model.md), [flows.md](flows.md).

## Design goals

- Keep the codebase small, typed, and easy to reason about.
- Keep the renderer free of Node.js and filesystem APIs.
- Keep pure logic (querying, parsing, grouping, queues) independent of the DOM so it can be tested.
- Load lyrics only when needed; never during library scanning.
- Preserve user context (search text, selected view, scroll position) when opening and closing
  Now Playing.

## Current capabilities

- Recursively scan a chosen folder for `.flac` files.
- Read tags with `music-metadata`, cache results, and reuse them when file `mtime` and size match.
- Group tracks into albums by album artist + album title, with disc/track ordering.
- Extract embedded or folder cover art, resize it, and cache JPEGs.
- Browse **Albums**, **Artists**, and **Tracks** views with search and per-view sorting.
- Play tracks through a `media://` protocol with byte-range seeking.
- Queue an album, an artist, or the visible filtered list (tracks view) with a queue context.
- Control playback with shuffle and off/all/one repeat over an editable queue model, and inspect,
  reorder, remove, clear, or jump within it from a virtualized slide-over queue panel.
- Right-click (or `Shift+F10`) tracks, albums, artists, queue rows, and the current track for
  playback, queue, navigation, and reveal actions, with non-blocking status toasts.
- Load embedded lyrics on demand and display them in a **Now Playing** view.
- Render line-timed LRC, word-timed enhanced LRC, and plain untimed lyrics.
- Render an aligned translation under each lyric line, with a menu picker and quick toggle.
- Synchronize lyrics from `requestAnimationFrame` using only the playback engine position.
- Persist the last folder, volume, active view, per-view sort, shuffle, and repeat between launches.

Architecture in one line: **the main process owns the filesystem, tags, covers, persistence, and the
`media://` protocol; the preload exposes a small typed bridge; the renderer owns all UI, playback
state, and lyric presentation.**

## System architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ Main process (Node.js, full privileges)                              │
│                                                                      │
│  index.ts ── app lifecycle + startup wiring                          │
│    ├─ window.ts ── BrowserWindow + renderer sends                    │
│    ├─ ipc.ts ── library:*, settings:*, lyrics:* handlers             │
│    ├─ scanCoordinator.ts ── generation, progress, folder persistence │
│    ├─ store.ts ── settings/cache state                               │
│    ├─ library.ts ── scan, cache reuse, snapshot, path index          │
│    │    ├─ tags.ts ── music-metadata tag reads + fallbacks           │
│    │    ├─ albums.ts ── pure album grouping/sorting                  │
│    │    └─ ids.ts ── SHA-1 ids                                       │
│    ├─ cache.ts / settings.ts / json-file.ts ── persistence           │
│    ├─ covers.ts ── embedded/folder art → cached JPEGs                │
│    ├─ reveal.ts + pathContainment.ts ── reveal validated FLAC        │
│    ├─ lyrics/ ── embedded + sidecar providers, choice store          │
│    └─ media-protocol.ts + range.ts ── media:// serving + ranges      │
│                                                                      │
│  Events out: library:scan-progress, library:updated                  │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ contextBridge (typed, minimal)
┌───────────────────────────────┴──────────────────────────────────────┐
│ Preload (contextIsolation, sandbox)                                  │
│  window.library: getState, openFolder, rescan, revealTrack,            │
│                  getSettings, saveVolume, saveUiState,                │
│                  savePlaybackSettings, getLyricSources,              │
│                  saveLyricChoice, saveLyricPreference,               │
│                  saveTranslationChoice, saveTranslationSettings,     │
│                  onScanProgress, onLibraryUpdated                    │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ no Node APIs in renderer
┌───────────────────────────────┴──────────────────────────────────────┐
│ Renderer (DOM only)                                                  │
│                                                                      │
│  src/main.ts ── composition root only                                │
│    ├─ dom.ts ── typed element lookup                                 │
│    ├─ navigation.ts + routeStack.ts ── views + detail stack          │
│    ├─ toolbar.ts ── search, sort, view switcher, shortcuts           │
│    ├─ libraryController.ts ── snapshot, scan state, startup          │
│    ├─ transport.ts ── queue + engine + seek + volume                 │
│    ├─ nowPlaying.ts + playerBar.ts ── playback views                 │
│    ├─ queuePanelController.ts ── panel model + queue intents        │
│    ├─ screen.ts + views/* ── section choice + rendering              │
│    ├─ library/query.ts ── pure index + view/sort registry + search   │
│    ├─ player/engine.ts ── PlaybackEngine + HtmlAudioEngine           │
│    ├─ player/transportDecisions.ts ── pure ended/prev/failure rules  │
│    ├─ player/queue/ ── editable queue + shuffle + repeat             │
│    ├─ queue/ ── pure panel rows + drag/keyboard geometry             │
│    ├─ menus/ ── pure menu builders, action dispatch, toast text      │
│    ├─ library/artistTracks.ts ── pure artist playback ordering       │
│    ├─ ui/virtualList.ts ── fixed-row virtual scroller                │
│    ├─ ui/queuePanel.ts ── virtualized queue slide-over               │
│    ├─ ui/contextMenu.ts + menuTrigger.ts ── floating menu + triggers │
│    ├─ ui/toast.ts ── one-at-a-time status toast                      │
│    ├─ lyrics/lyricsController.ts ── fetch/parse/select/state/cache   │
│    ├─ lyrics/translationState.ts ── pure translation-layer state     │
│    ├─ lyrics/translationMenuModel.ts ── translation menu/toggle model│
│    ├─ lyrics/translationLabels.ts ── language + sidecar examples     │
│    ├─ lyrics/translationText.ts ── per-line translation lookup       │
│    ├─ lyrics/segmentGroups.ts ── pure word grouping                  │
│    ├─ ui/lyricView.ts ── lyric DOM + rAF sync + scroll + seek        │
│    ├─ ui/translationToggle.ts ── translation quick-toggle pill       │
│    └─ styles/*.css + src/style.css ── all presentation               │
└──────────────────────────────────────────────────────────────────────┘
```

## Process boundaries

| Concern | Owner | Renderer access |
| --- | --- | --- |
| Filesystem walking, stat, tags | Main | None |
| Library cache/settings files | Main | None |
| Cover extraction/resizing/cache | Main | Only via `media://cover/<id>` |
| Audio bytes | Main (`media://track/<id>`) | `<audio src>` only |
| Lyrics from embedded tags and sidecars | Main | `getLyricSources(trackId)` |
| Reveal a scanned file in the OS file manager | Main | `revealTrack(trackId)` → boolean |
| Translation alignment/attachment | Renderer (pure shared module) | Direct |
| Playback position/transport | Renderer | Direct |
| Library queries, search, sort | Renderer | Direct |
| UI state persistence values | Renderer proposes, main validates/stores | Via IPC |

## Module responsibilities

This table keeps the intent that graphify cannot derive. For exact imports, call sites, and
who-depends-on-whom, run `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or
`graphify explain "<concept>"`.

### Root

| Path | Responsibility |
| --- | --- |
| `package.json` | Package manifest, scripts, dependencies. See [build-and-config.md](build-and-config.md). |
| `electron.vite.config.ts` | electron-vite build configuration. |
| `tsconfig.json` / `tsconfig.node.json` / `tsconfig.web.json` | TypeScript project references and per-runtime projects. |
| `README.md` | User-facing project documentation. |
| `specs/` | This as-built specification split. |

### Main process — `src/main/`

| Path | Responsibility |
| --- | --- |
| `index.ts` | App lifecycle + startup wiring. |
| `window.ts` | BrowserWindow creation + renderer sends. |
| `ipc.ts` | IPC channel registration + validation. |
| `scanCoordinator.ts` | Scan generation, progress, folder persistence. |
| `store.ts` | Shared settings/cache state container. |
| `library.ts` | Scanning, cache reuse, snapshots, path index. |
| `tags.ts` | Tag reading + fallbacks. |
| `albums.ts` | Pure album grouping/sorting. |
| `cache.ts` | Versioned library cache. |
| `settings.ts` | Settings normalization + persistence. |
| `covers.ts` | Cover extraction/resizing/cache. |
| `media-protocol.ts` | `media://` handler. |
| `pathContainment.ts` | Pure strict-containment and reveal-path guards. |
| `reveal.ts` | Resolve, canonicalize, and validate a track before revealing it in the OS file manager. |
| `range.ts` | Range header parser. |
| `lyrics/embedded.ts` | Embedded tag resolver. |
| `lyrics/sidecar.ts` | Sidecar discovery + decoding. |
| `lyrics/sources.ts` | Provider list + canonical options. |
| `lyrics/choices.ts` | Per-track lyric + translation choice store. |
| `ids.ts` | SHA-1 ids. |
| `json-file.ts` | Tolerant reads, atomic writes. |

### Preload — `src/preload/`

| Path | Responsibility |
| --- | --- |
| `index.ts` | `contextBridge` API (`window.library`). |
| `index.d.ts` | Global `Window` typing. |

### Renderer — `src/renderer/`

| Path | Responsibility |
| --- | --- |
| `index.html` | App shell + CSP. |
| `src/main.ts` | Composition root. |
| `src/dom.ts` | Typed element lookup. |
| `src/format.ts` | Shared DOM/time helpers. |
| `src/routeStack.ts` | Pure route-stack operations. |
| `src/navigation.ts` | Active view + detail stack. |
| `src/toolbar.ts` | Search, sort, view switcher, shortcuts. |
| `src/libraryController.ts` | Snapshot, scan state, startup ordering. |
| `src/transport.ts` | Queue, engine, seek, volume. |
| `src/nowPlaying.ts` | Now Playing lifecycle + lyric subscription. |
| `src/playerBar.ts` | Bottom bar + transport control view. |
| `src/queuePanelController.ts` | Queue-panel model, queue mutations, and playback intents. |
| `src/screen.ts` | Section choice + view rendering. |
| `src/style.css` | Theme + app layout. |
| `src/views/` | Album grid, artist list, tracks, detail renderers. |
| `styles/lyrics.css` | Lyric + Now Playing styling. |
| `styles/lyricSourceMenu.css` | Source chip/popover + translation toggle styling. |
| `styles/contextMenu.css` | Floating context-menu styling. |
| `styles/queuePanel.css` | Queue slide-over and drag-indicator styling. |
| `styles/toast.css` | Bottom-center toast region styling. |
| `library/query.ts` | Pure view/sort/search registry. |
| `library/artistTracks.ts` | Pure artist playback ordering. |
| `player/engine.ts` | Playback abstraction. |
| `player/transportDecisions.ts` | Pure ended/previous/failure/repeat decisions. |
| `player/queue/` | Editable queue, shuffle helpers, and queue types. |
| `queue/queuePanelModel.ts` | Pure queue-panel rows, sections, counts, and header model. |
| `queue/dragReorder.ts` | Pure pointer-slot, move-destination, keyboard bounds, and auto-scroll helpers. |
| `menus/contextMenuModels.ts` | Pure track/album/artist/queue-row/current-track menu builders. |
| `menus/contextActions.ts` | Menu-action dispatch with injected queue/transport/navigation/toast/reveal dependencies. |
| `menus/toastMessages.ts` | Exact toast strings and title truncation. |
| `lyrics/lyricsController.ts` | Source fetch/parse/select/state/cache. |
| `lyrics/translationState.ts` | Pure translation layer + document attachment. |
| `lyrics/translationMenuModel.ts` | Pure translation section + quick-toggle model. |
| `lyrics/translationLabels.ts` | Language labels + sidecar example names. |
| `lyrics/translationText.ts` | Per-line translation text lookup. |
| `lyrics/segmentGroups.ts` | Pure word grouping. |
| `lyrics/sourceMenuModel.ts` | Pure source-menu view model + keyboard helper. |
| `lyrics/lyricMenuText.ts` | Shared disabled-reason strings and `unavailableReason()` for source and translation rows. |
| `ui/lyricView.ts` | Lyric DOM, rAF sync, scroll, seek. |
| `ui/lyricSourceMenu.ts` | Source chip/popover component. |
| `ui/lyricSourceMenuView.ts` | Stateless popover body builder. |
| `ui/translationToggle.ts` | Translation quick-toggle pill. |
| `ui/virtualList.ts` | Fixed-row virtual scroller. |
| `ui/contextMenu.ts` | Generic floating menu with ARIA, focus, positioning, and close rules. |
| `ui/menuTrigger.ts` | Right-click and Shift+F10/Menu-key trigger wiring. |
| `ui/queuePanel.ts` | Virtualized queue slide-over DOM, drag handling, focus, and context triggers. |
| `ui/toast.ts` | Single non-blocking status toast with auto-dismiss. |

UNVERIFIED/POSSIBLY STALE: `src/renderer/lyrics/lyricMenuText.ts` exists in the current tree and is
imported by `sourceMenuModel.ts` and `translationMenuModel.ts`, but the original §4 layout and §17
change map did not mention it. It is listed here with a description derived from the source rather
than silently folded into the menu specs.

### Shared — `src/shared/`

| Path | Responsibility |
| --- | --- |
| `types.ts` | Cross-process data + API types. |
| `lyrics/types.ts` | Lyric document/line/segment/parser types. |
| `lyrics/sources.ts` | Source types + pure main/translation selection. |
| `lyrics/translation.ts` | Pure alignment + attachment. |
| `lyrics/parse.ts` | Parser registry + format detection. |
| `lyrics/time.ts` | Timestamp parsing. |
| `lyrics/sync.ts` | Synchronization helpers. |
| `lyrics/index.ts` | Public re-exports. |
| `lyrics/parsers/{shared,plain,lrc,enhanced-lrc}.ts` | Parser implementations and shared finalization. |

### Tests

`tests/` contains the Vitest suite, two unit lyric fixtures, and the in-repo CDP end-to-end suite
(`tests/e2e/`). The Vitest coverage map, E2E tiers, fixture names, commands, and current counts live
only in [testing-and-verification.md](testing-and-verification.md); the file list is derivable with
graphify.
