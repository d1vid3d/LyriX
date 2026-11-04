# LyriX — Technical Specification

> Status: as-built reference for LyriX 0.1.0. This document describes what the code currently does,
> where responsibilities live, and how to extend it safely. It is intentionally separate from the
> user-facing `README.md`.

**How to use this document**

- **Contributors** — read §2 (invariants) and §3 (architecture) first, then the module section for
  the area you are changing.
- **Agents** — §4 (repository layout) and §17 (extension guide and change map) are the fastest way to
  find the right file; §19 lists the checks required before handing work back.
- **Source of truth** — the code wins. When behavior changes, update this document in the same
  change so it stays as-built rather than aspirational.

---

## 1. Executive summary

LyriX is a minimal desktop player for local FLAC libraries built with **Electron**, **electron-vite**,
**TypeScript**, and plain **HTML/CSS**. It has no UI framework, no runtime state library, and no
dependencies beyond `music-metadata` (main process) plus the Electron/Vite/Vitest toolchain.

Current capabilities:

- Recursively scan a chosen folder for `.flac` files.
- Read tags with `music-metadata`, cache results, and reuse them when file `mtime` and size match.
- Group tracks into albums by album artist + album title, with disc/track ordering.
- Extract embedded or folder cover art, resize it, and cache JPEGs.
- Browse **Albums**, **Artists**, and **Tracks** views with search and per-view sorting.
- Play tracks through a `media://` protocol with byte-range seeking.
- Queue an album (album detail) or the visible filtered list (tracks view).
- Load embedded lyrics on demand and display them in a **Now Playing** view.
- Render line-timed LRC, word-timed enhanced LRC, and plain untimed lyrics.
- Synchronize lyrics from `requestAnimationFrame` using only the playback engine position.
- Persist the last folder, volume, active view, and per-view sort between launches.

Architecture in one line: **the main process owns the filesystem, tags, covers, persistence, and the
`media://` protocol; the preload exposes a small typed bridge; the renderer owns all UI, playback
state, and lyric presentation.**

### Current verification status

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passes (main/preload and renderer projects). |
| `npm test` | 180 tests pass across 11 files. |
| `npm run build` | Passes; emits `out/main`, `out/preload`, `out/renderer`. |
| `npm run dev` | Starts electron-vite and Electron. |

An Electron/CDP end-to-end smoke test (kept outside the repo) also exercises library scanning,
playback, all three lyric formats, missing lyrics, line seeking, live track changes, Now Playing
open/close, search/view/scroll preservation, and console cleanliness.

---

## 2. Goals, non-goals, and invariants

### Goals

- Keep the codebase small, typed, and easy to reason about.
- Keep the renderer free of Node.js and filesystem APIs.
- Keep pure logic (querying, parsing, grouping, queues) independent of the DOM so it can be tested.
- Load lyrics only when needed; never during library scanning.
- Preserve user context (search text, selected view, scroll position) when opening and closing
  Now Playing.

### Non-goals (current scope)

Shuffle, repeat, gapless playback, crossfade, queue panel/editing, fuzzy search, search history,
filters, artist images, multi-artist splitting, genres, grid/artist virtualization, sidecar `.lrc`
loading, online lyric lookup, singer-specific styling, translations, TTML, tag editing, packaging.

### Invariants

1. **Renderer never sees real file paths.** It receives track and album ids plus `media://` URLs.
2. **Main process validates every id and every path.** Track paths are looked up from the scanned
   library, never accepted from the renderer.
3. **`media://` enforces path containment** using `realpath` + relative-path checks, and only serves
   regular `.flac` files or cached cover JPEGs.
4. **Lyrics are on-demand only.** They are not read during scan and not stored in the library cache.
5. **Lyric IPC never throws across the boundary.** Invalid ids, missing files, and parse failures
   resolve to `null`.
6. **Disk writes are atomic.** Settings, library cache, and cover files use temp-file + rename.
7. **Scans are cancellable.** A generation counter makes stale scans stop reporting and never
   overwrite newer state.
8. **Persisted values are validated** by the main process before use, and again by the renderer for
   view/sort keys.
9. **The renderer reads playback position only through `PlaybackEngine`**, never by reaching into the
   `<audio>` element for lyric sync.
10. **UI updates are minimal.** Virtual rows and lyric lines update only when their state changes.

---

## 3. System architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ Main process (Node.js, full privileges)                              │
│                                                                      │
│  index.ts ── startup, IPC, scan coordination, background refresh     │
│    ├─ library.ts ── scan, cache reuse, snapshot, path index           │
│    │    ├─ tags.ts ── music-metadata tag reads + fallbacks            │
│    │    ├─ albums.ts ── pure album grouping/sorting                   │
│    │    └─ ids.ts ── SHA-1 ids                                       │
│    ├─ cache.ts / settings.ts / json-file.ts ── persistence           │
│    ├─ covers.ts ── embedded/folder art → cached JPEGs                │
│    ├─ lyricsSource.ts ── ordered embedded lyric resolvers            │
│    └─ media-protocol.ts + range.ts ── media:// serving + ranges      │
│                                                                      │
│  IPC handlers: library:*, settings:*, lyrics:get                     │
│  Events out: library:scan-progress, library:updated                  │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ contextBridge (typed, minimal)
┌───────────────────────────────┴──────────────────────────────────────┐
│ Preload (contextIsolation, sandbox)                                  │
│  window.library: getState, openFolder, rescan, getSettings,          │
│                  saveVolume, saveUiState, getLyrics,                 │
│                  onScanProgress, onLibraryUpdated                    │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ no Node APIs in renderer
┌───────────────────────────────┴──────────────────────────────────────┐
│ Renderer (DOM only)                                                  │
│                                                                      │
│  src/main.ts ── routing, rendering, search/sort, queue/transport,    │
│                 Now Playing lifecycle, lyric controller subscription │
│    ├─ library/query.ts ── pure index + view/sort registry + search   │
│    ├─ player/engine.ts ── PlaybackEngine + HtmlAudioEngine            │
│    ├─ player/queue.ts ── pure current-index queue                    │
│    ├─ ui/virtualList.ts ── fixed-row virtual scroller                │
│    ├─ lyrics/lyricsController.ts ── fetch/parse/state/cache          │
│    ├─ lyrics/segmentGroups.ts ── pure word grouping                  │
│    ├─ ui/lyricView.ts ── lyric DOM + rAF sync + scroll + seek        │
│    └─ styles/lyrics.css + src/style.css ── all presentation          │
└──────────────────────────────────────────────────────────────────────┘
```

### Process boundaries

| Concern | Owner | Renderer access |
| --- | --- | --- |
| Filesystem walking, stat, tags | Main | None |
| Library cache/settings files | Main | None |
| Cover extraction/resizing/cache | Main | Only via `media://cover/<id>` |
| Audio bytes | Main (`media://track/<id>`) | `<audio src>` only |
| Lyrics from tags | Main | `getLyrics(trackId)` |
| Playback position/transport | Renderer | Direct |
| Library queries, search, sort | Renderer | Direct |
| UI state persistence values | Renderer proposes, main validates/stores | Via IPC |

---

## 4. Repository layout

```
LyriX/
├─ package.json
├─ electron.vite.config.ts
├─ tsconfig.json / tsconfig.node.json / tsconfig.web.json
├─ README.md
├─ TechnicalSpecs.md
├─ src/
│  ├─ main/
│  │  ├─ index.ts              app lifecycle, IPC, scan orchestration
│  │  ├─ library.ts            scanning, cache reuse, snapshots, path index
│  │  ├─ tags.ts               tag reading + fallbacks
│  │  ├─ albums.ts             pure album grouping/sorting
│  │  ├─ cache.ts              versioned library cache
│  │  ├─ settings.ts           settings normalization + persistence
│  │  ├─ covers.ts             cover extraction/resizing/cache
│  │  ├─ media-protocol.ts     media:// handler
│  │  ├─ range.ts              Range header parser
│  │  ├─ lyricsSource.ts       lyric resolver list + embedded tags
│  │  ├─ ids.ts                SHA-1 ids
│  │  └─ json-file.ts          tolerant reads, atomic writes
│  ├─ preload/
│  │  ├─ index.ts              contextBridge API
│  │  └─ index.d.ts            global Window typing
│  ├─ renderer/
│  │  ├─ index.html            app shell + CSP
│  │  ├─ src/main.ts           UI controller
│  │  ├─ src/style.css         theme + app layout
│  │  ├─ styles/lyrics.css     lyric + Now Playing styling
│  │  ├─ library/query.ts      pure view/sort/search registry
│  │  ├─ player/engine.ts      playback abstraction
│  │  ├─ player/queue.ts       pure queue
│  │  ├─ lyrics/lyricsController.ts
│  │  ├─ lyrics/segmentGroups.ts
│  │  └─ ui/lyricView.ts
│  │  └─ ui/virtualList.ts
│  └─ shared/
│     ├─ types.ts              cross-process data + API types
│     └─ lyrics/
│        ├─ types.ts
│        ├─ parse.ts
│        ├─ time.ts
│        ├─ sync.ts
│        ├─ index.ts
│        └─ parsers/{shared,plain,lrc,enhanced-lrc}.ts
└─ tests/
   ├─ albums.test.ts
   ├─ cache.test.ts
   ├─ ids.test.ts
   ├─ json-file.test.ts
   ├─ lyrics.test.ts
   ├─ lyricsController.test.ts
   ├─ query.test.ts
   ├─ queue.test.ts
   ├─ range.test.ts
   ├─ segmentGroups.test.ts
   ├─ settings.test.ts
   └─ fixtures/{LineByLine.txt,TimedWordByWord.txt}
```

---

## 5. Build, tooling, and configuration

### Scripts (`package.json`)

| Script | Purpose |
| --- | --- |
| `npm run dev` | electron-vite dev server + Electron. |
| `npm run build` | Production bundle into `out/`. |
| `npm start` | Preview the production bundle. |
| `npm run typecheck` | `typecheck:node` then `typecheck:web`. |
| `npm run typecheck:node` | `tsc` over main, preload, shared, config. |
| `npm run typecheck:web` | `tsc` over renderer, preload `.d.ts`, shared. |
| `npm test` | `vitest run`. |

### TypeScript projects

- `tsconfig.node.json` — ES2022, `moduleResolution: Bundler`, Node + electron-vite types; includes
  `src/main/**`, `src/preload/**`, `src/shared/**`, and the Vite config.
- `tsconfig.web.json` — ES2022 + DOM libs, Vite client types; includes `src/renderer/**/*.ts`,
  `src/preload/*.d.ts`, `src/shared/**`.
- `tsconfig.json` — solution file with project references.
- Strict mode, `isolatedModules`, `verbatimModuleSyntax`, and `skipLibCheck` are enabled.

### electron-vite

`electron.vite.config.ts` excludes `music-metadata` from dependency externalization so the ESM-only
package is bundled into the CJS main process.

### Renderer security settings

`BrowserWindow` uses `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
`index.html` sets a CSP allowing only self scripts, self/inline styles, `data:`/`media:` images, and
`self`/`media:` audio.

---

## 6. Shared data model (`src/shared/types.ts`)

| Type | Fields / purpose |
| --- | --- |
| `Track` | `id`, `title`, `artist`, `album`, `albumArtist`, `trackNumber`, `discNumber`, `year`, `duration`, `url` (`media://track/<id>`). |
| `Album` | `id`, `title`, `artist` (album artist), `year`, `coverUrl` (`media://cover/<id>`), `tracks`. |
| `CachedTrack` | Tag values plus `mtimeMs` and `size` for cache validation. |
| `LibraryCache` | `version`, `folder`, `tracks: Record<absolutePath, CachedTrack>`. |
| `UiState` | `lastView`, `sortByView`. |
| `Settings` | `UiState` + `lastFolder`, `volume`. |
| `ScanProgress` | `scanned`, `total`. |
| `LibrarySnapshot` | `folderName`, `albums`. |
| `LyricsResult` | `text`, `source` (tag/resolver that supplied it). |
| `LibraryApi` | Typed preload surface (see §8). |

Ids are 40-character lowercase SHA-1 hex strings:

- Track id = SHA-1 of the absolute file path.
- Album id = SHA-1 of `albumArtist + "\u0000" + album`.
- Both are validated with `/^[a-f0-9]{40}$/` before use.

---

## 7. Main process modules

### 7.1 `src/main/index.ts` — application shell and IPC

**Startup sequence**

1. `registerMediaScheme()` runs before `app.whenReady()` (required by Electron).
2. On ready: set app user model id, resolve `userData/settings.json` and
   `userData/library-cache.json`.
3. Load settings and cache (tolerant; invalid data falls back to defaults).
4. `realpath` the last folder when possible, then `restoreLibrary(root, cache)` to show cached data
   immediately without reading audio files.
5. Create `CoverService(userData/covers)` and install the `media://` handler.
6. Register IPC, create the window, handle macOS re-activation.
7. On non-macOS, quit when all windows close.

**Scan orchestration**

- `runScan(folder, persistFolder)` increments `scanGeneration`; the `isCancelled` closure compares
  the captured generation with the current one.
- Delegates walking/tagging to `scanLibrary`, applies the result with `applyLibrary`, saves the cache,
  and optionally persists the folder.
- Progress events are throttled to one per 100 ms except for the final tick.
- `chooseFolder()` opens the directory dialog, canonicalizes the path when possible, and scans.
- `rescan()` re-scans the current root without changing the persisted folder.
- `refreshInBackground()` scans the restored root on startup and emits `library:updated` only when
  the scan was not superseded.
- `library:get-state` starts the one-time startup refresh only when a last folder exists, after the
  renderer has had a chance to subscribe.

**IPC handlers**

| Channel | Input | Output |
| --- | --- | --- |
| `library:get-state` | — | `LibrarySnapshot` |
| `library:open-folder` | — | `LibrarySnapshot \| null` (null on cancel/empty) |
| `library:rescan` | — | `LibrarySnapshot \| null` (null when no root) |
| `lyrics:get` | `trackId: unknown` | `LyricsResult \| null` |
| `settings:get` | — | `Settings` |
| `settings:set-volume` | `volume: unknown` | `void` (clamped) |
| `settings:set-ui` | `UiState` candidate | `void` (normalized) |

**Events to renderer**

| Channel | Payload | When |
| --- | --- | --- |
| `library:scan-progress` | `ScanProgress` | During scans, throttled. |
| `library:updated` | `LibrarySnapshot` | After a successful background refresh. |

**Lyrics handler details**

- Rejects non-string/empty ids with `null`.
- Resolves the file path through `resolveTrackFile(trackId)`; the renderer cannot supply a path.
- Catches every error and returns `null`.

### 7.2 `src/main/library.ts` — scanning, snapshots, path index

State is a module-level object:

- `root`, `folderName`, `snapshot`, `trackPaths: Map<id, absolutePath>`,
  `albumTrackPaths: Map<albumId, absolutePath[]>`.

Key functions:

- `restoreLibrary(folder, cache)` — resets state and rebuilds from cached entries when the cache
  folder matches; otherwise starts empty.
- `applyLibrary(folder, entries)` — sets the active root and rebuilds from a fresh scan.
- `applyEntries(entries)` — creates `Track` objects, builds path maps, groups albums with
  `groupTracks`, and stores the snapshot.
- `scanLibrary(folder, previous, onProgress, isCancelled)` — recursively collects `.flac` files,
  reuses entries whose `mtimeMs` and `size` match, reads changed files with up to **8** concurrent
  workers, reports progress for cached and parsed files alike, and stops when cancelled.
- `collectFlacFiles(dir)` — skips symbolic links, ignores unreadable folders/files with a warning,
  matches `.flac` case-insensitively.
- `getSnapshot()`, `getLibraryRoot()`, `resolveTrackFile(id)`, `getAlbumTrackPaths(albumId)`.
- `isPathInside(root, target)` — relative-path containment used by the media protocol.

### 7.3 `src/main/tags.ts` — tag reading and fallbacks

`readTrackTags(filePath, mtimeMs, size)` calls `parseFile` with duration and skips covers.

- Title falls back to the filename without extension.
- Artist falls back to `Unknown Artist`; album to `Unknown Album`; album artist to the artist.
- Track/disc/year become `null` when missing or non-finite; duration becomes `0`.
- Any read error is logged and returns the same filename/unknown fallbacks, so one bad file cannot
  abort a scan.

### 7.4 `src/main/albums.ts` — pure grouping

- Groups by `${albumArtist}\u0000${album}` so same-titled albums by different artists stay separate.
- Album id = `hashId(key)`.
- Album year = first non-null track year.
- Tracks sort by disc (null → 1), then track number (null → last), then title.
- Albums sort by title with `localeCompare(..., { sensitivity: 'base', numeric: true })`.

### 7.5 `src/main/cache.ts` — library cache

- Schema version `1`.
- `loadLibraryCache` validates the version, folder type, and every entry; malformed entries are
  dropped individually. Invalid top-level data yields an empty cache.
- `saveLibraryCache` writes atomically.

### 7.6 `src/main/settings.ts` — settings normalization

- Defaults: `lastFolder: null`, `volume: 1`, `lastView: 'albums'`, `sortByView: {}`.
- `clampVolume` keeps `[0, 1]` and replaces non-finite values with `1`.
- `normalizeUiState` keeps only string view names and non-empty string sort values.
- `normalize` validates the folder string, clamps volume, and merges normalized UI state.
- Reads use `readJsonFile`; writes use `writeJsonAtomic` with normalization.

### 7.7 `src/main/covers.ts` — cover art

`CoverService` caches generated JPEGs in `userData/covers`.

- Full cover target width: **300 px**; small cover: **96 px**.
- Cache filenames: `<albumId>.jpg` and `<albumId>-small.jpg`.
- `getCover(albumId, size)` validates the album id, returns an existing file, and deduplicates
  in-flight generation by `albumId:size`.
- Full cover source order: embedded picture from up to the first **3** album tracks, then
  `cover.jpg`, `folder.jpg`, or `front.jpg` in album folders (case-insensitive).
- Small covers are generated from the full cached cover, not re-extracted.
- JPEG quality 85; images are only downscaled when wider than the target.
- Albums without usable art return `null`, and the renderer shows a `♪` placeholder.

### 7.8 `src/main/media-protocol.ts` and `range.ts`

The `media` scheme is registered as **standard, secure, fetch-capable, and streaming** before app
ready.

`media://track/<id>`:

1. Validates the 40-hex id.
2. Resolves the indexed path and the library root.
3. `realpath`s both and rejects anything outside the root.
4. Requires a regular `.flac` file.
5. Supports `HEAD`.
6. Serves `200` with the whole file when there is no `Range`, `206` with `Content-Range` for a valid
   range, `416` for an unsatisfiable range, and `404` for bad ids/paths.
7. Malformed `Range` headers are ignored and the whole file is served.
8. Streams with `createReadStream` and aborts the stream when the request signal aborts.
9. Sends `Content-Type: audio/flac`, `Accept-Ranges: bytes`, `Cache-Control: no-store`.

`media://cover/<id>?size=small`:

1. Validates the album id.
2. Asks `CoverService` for the full or small JPEG.
3. Serves `image/jpeg` with `Cache-Control: no-store`, or `404`.

`parseByteRange(header, size)` supports `start-end`, `start-`, and `-suffix`, returning
`{ start, end }`, `'invalid'`, or `'unsatisfiable'`.

### 7.9 `src/main/lyricsSource.ts` — lyric resolvers

- `LyricsTrack = { id, filePath }`; `LyricResolver = (track) => Promise<LyricsResult | null>`.
- `RESOLVERS` is an ordered list; currently only `embeddedResolver`. The first non-empty result wins.
- Each resolver is wrapped in `try/catch`; failures are logged and the next resolver runs.
- One `console.debug` is emitted per successful result with the track id and source.
- `embeddedResolver` calls `parseFile(filePath, { duration: false, skipCovers: true })`.
- Lookup order:
  1. `common.lyrics` (string or `{ text }` / `{ syncText }` entries).
  2. Native tags whose id is `LYRICS` or `UNSYNCEDLYRICS`, case-insensitive.
- `music-metadata` strips timestamps from `common.lyrics[].text` but retains millisecond entries in
  `syncText`; the resolver reconstructs line-timed LRC (`[mm:ss.cc]`) from `syncText` when the text
  itself has no timestamps. This preserves timed and enhanced word lyrics.
- Handles strings, arrays, `{ text }`, `{ value }`, and `{ syncText }` shapes defensively.

### 7.10 `src/main/ids.ts` and `json-file.ts`

- `hashId(value)` → lowercase SHA-1 hex.
- `readJsonFile(path, fallback)` returns the fallback on any read/parse error and only logs non-ENOENT
  failures.
- `writeFileAtomic(path, data)` writes a temp file in the same directory, renames it into place, and
  removes the temp file on failure.
- `writeJsonAtomic` writes pretty-printed JSON via the same path.

---

## 8. Preload bridge (`src/preload/index.ts`)

The preload exposes exactly one global, `window.library`, typed by `LibraryApi`:

| Method | IPC channel | Notes |
| --- | --- | --- |
| `getState()` | `library:get-state` | Returns the current snapshot. |
| `openFolder()` | `library:open-folder` | `null` when the dialog is cancelled. |
| `rescan()` | `library:rescan` | `null` when no folder is open. |
| `getSettings()` | `settings:get` | Returns normalized settings. |
| `saveVolume(volume)` | `settings:set-volume` | Main clamps the value. |
| `saveUiState(state)` | `settings:set-ui` | Main normalizes the value. |
| `getLyrics(trackId)` | `lyrics:get` | Returns raw text + source, or `null`. |
| `onScanProgress(listener)` | `library:scan-progress` | Returns an unsubscribe function. |
| `onLibraryUpdated(listener)` | `library:updated` | Returns an unsubscribe function. |

`subscribe()` wraps the IPC listener so the renderer callback never receives the Electron event
object, and returns a function that removes exactly that listener.

`src/preload/index.d.ts` declares `Window.library: LibraryApi` for the renderer project.

---

## 9. Renderer modules

### 9.1 `src/renderer/src/main.ts` — UI controller

This is the composition root for the renderer. It:

- Wires DOM elements by id (throwing early if markup is missing).
- Creates the `HtmlAudioEngine`, `PlaybackQueue`, `LyricsController`, `LyricView`, and the tracks
  `VirtualList`.
- Owns view routing, rendering, search, sort, playback transport, Now Playing lifecycle, and settings
  persistence.
- Subscribes to engine, library, and lyric events and cleans them up on `beforeunload`.

**Renderer state**

| Variable | Meaning |
| --- | --- |
| `albums`, `libraryIndex`, `folderName` | Current snapshot and precomputed index. |
| `activeView` | `albums` \| `artists` \| `tracks`. |
| `sortByView` | Selected sort key per view. |
| `detailStack` | Stack of `{ kind: 'album', albumId }` or `{ kind: 'artist', artistName }`. |
| `appliedSearch` | Debounced search text currently applied. |
| `visibleTrackItems` | Tracks currently visible in the tracks view; used for queueing. |
| `isSeeking` | Suppresses time-label updates while dragging the seek bar. |
| `libraryEventReceived` | Prevents an older `getState` response from overwriting a newer event. |
| `activeAttempt` | Token for the current `play()` attempt so stale failures are ignored. |
| `nowPlayingOpen` | Whether Now Playing owns the main content area. |
| `libraryDirtyWhileNowPlaying` | A snapshot arrived while Now Playing was open; refresh on close. |

**View routing**

- `showSection(section)` hides every view except the given one.
- `currentSection()` returns the top detail view or the active library view.
- `refreshScreen()` syncs controls and renders the current section; while Now Playing is open it only
  shows the Now Playing section and leaves the hidden library DOM untouched.
- `openAlbum` / `openArtist` push routes; `goBack` pops; `switchView` resets the stack.
- `leaveNowPlayingForNavigation()` closes Now Playing for actions that will render another view.
- `closeNowPlaying()` restores the previous section, or re-renders first when the library changed
  while it was open.

**Search and sort**

- Search is debounced by **150 ms**.
- `applySearch` closes Now Playing if necessary, re-renders the active library view, then restores the
  appropriate section.
- `Ctrl/Cmd+F` and `/` focus the search box; `Escape` clears it (Now Playing `Escape` takes
  priority).
- Changing sort updates `sortByView[activeView]`, re-renders, and persists.
- View/sort changes are persisted through `saveUiState()`.

**Playback**

- `playQueue(tracks, index)` sets the queue; clicking the already-current track resumes instead of
  reloading.
- `playAlbumTrack` queues the album in album order.
- `playVisibleTrack` queues the current filtered/sorted tracks list.
- `startCurrentTrack(autoplay)` loads the track, calls `lyricsController.setTrack(track.id)`, resets
  time UI, updates Now Playing/highlight/controls, and optionally plays.
- `handleEnded` advances or stops at the end.
- `handlePlaybackFailure` ignores `AbortError` (pause interrupts `play()`), logs the failure, skips
  forward when possible, and otherwise pauses.
- `previous` restarts the track when position > 3 s, otherwise moves back.
- `resetPlayback` clears the queue, pauses, clears lyrics, and resets UI.

**Live library updates**

- `applySnapshot` replaces albums/index, reconciles the queue, drops invalid detail routes, marks
  Now Playing dirty if open, refreshes the screen, and updates status/controls.
- `reconcileQueue` rebuilds the queue from current track ids; if the current track disappeared, it
  resets playback.
- On startup, `getState` is applied only if no `library:updated` event already arrived.

### 9.2 `src/renderer/library/query.ts` — pure index, views, search, sort

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

### 9.3 `src/renderer/player/engine.ts` — playback abstraction

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

### 9.4 `src/renderer/player/queue.ts` — pure queue

`PlaybackQueue` stores a copied track array and an index.

- `setQueue(tracks, startIndex)` clamps the index and returns the current track.
- `current`, `next`, `previous`, `hasNext`, `hasPrevious`, `getTracks`, `getCurrentIndex`.
- No playback, DOM, or persistence concerns.

### 9.5 `src/renderer/ui/virtualList.ts` — fixed-row virtual scroller

- Builds a spacer with the full height and an absolutely positioned window inside it.
- Renders only the visible rows plus an overscan buffer (default 4) above and below.
- Re-renders on scroll via `requestAnimationFrame` and on container resize via `ResizeObserver`.
- `setItems` resets scroll and invalidates; `refresh` re-renders the current window (used when the
  playing highlight changes); `destroy` removes listeners and DOM.
- Used only by the tracks view, with 52 px rows.

### 9.6 `src/renderer/lyrics/lyricsController.ts` — on-demand lyric state

No DOM, Electron, or filesystem references. Constructed with a fetch function
(`window.library.getLyrics`).

State:

```ts
{ status: 'loading' | 'ready' | 'none', doc: LyricDocument | null, trackId: string | null }
```

Behavior:

- `setTrack(id)` ignores a repeated id; `null` clears state.
- Cache hit (including cached “none”) returns immediately and refreshes LRU order.
- Otherwise emits `loading` and starts a fetch.
- Each fetch captures a generation; a response is applied only if the generation is still current, so
  slow responses for a previous track are ignored.
- Parses with `parseLyrics`; empty text or zero lines becomes `none`.
- Caches parsed documents **and** `null` results, up to **10** entries, evicting the least recently
  used.
- `subscribe(listener)` adds a listener, immediately emits the current state, and returns an
  unsubscribe function.
- Fetch/parse errors are logged and cached as `none`.

### 9.7 `src/renderer/lyrics/segmentGroups.ts` — pure word grouping

`groupSegments(segments)` splits a line's segments into `LyricWordGroup` objects:

- Consecutive segments stay in one group until a segment with `spaceAfter: true` closes it.
- A trailing group without whitespace is still emitted.
- The renderer inserts one literal space between groups, so syllables inside a word never wrap.

### 9.8 `src/renderer/ui/lyricView.ts` — lyric DOM and synchronization

**DOM construction (once per document instance)**

- One `.lyric-line` div per line with `data-index`.
- `data-agent` is set only when the line has an agent label.
- Timed documents add `.lyric-line--seekable`, `tabindex="0"`, and `role="button"`.
- Lines with segments build `.lyric-word` containers (nowrap) containing `.lyric-seg` spans with
  `data-segment-index`; lines without segments set `textContent` directly.
- Plain documents add `.lyric-lines--static` and no click/seek behavior.

**Synchronization**

- `start()`/`stop()` control a single `requestAnimationFrame` loop.
- Each frame reads `engine.getPosition()` and computes:
  - primary line via `findActiveLineIndex`,
  - active set via `findActiveLineIndexes`,
  - active segment via `findActiveSegmentIndex`.
- Line classes toggled only when flags change: `lyric-line--current`, `--active`, `--past`,
  `--upcoming`, `--ended` (primary line whose end has passed).
- Segment classes toggled only when flags change: `lyric-seg--sung`, `--active`, `--upcoming`.
- The active segment gets `--progress` from `segmentProgress`; the previous active element's
  `--progress` is removed. Segment state is cleared when a line leaves the active set.
- The current line is centered with smooth scrolling when the primary line changes.
- Manual wheel/touch/drag pauses auto-centering for **4 seconds**; the pending target is applied after
  the pause.
- Clicking a timed line (or pressing Enter/Space on it) seeks to `line.start`; it does not change
  play/pause.
- `destroy()` cancels the frame, removes listeners, and clears the DOM.

### 9.9 Styles

**`src/renderer/src/style.css`** — theme variables (`--bg`, `--panel`, `--border`, `--text`,
`--muted`, `--accent`), toolbar, views, album grid, artist rows, track lists, detail views, player
bar, and scrollbars.

**`src/renderer/styles/lyrics.css`** — all lyric and Now Playing presentation. Variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `--lyric-font-size` | `20px` | Base lyric size. |
| `--lyric-font-size-current` | `23px` | Current-line size. |
| `--lyric-color-upcoming` | `#70707a` | Dim future lines/words. |
| `--lyric-color-past` | `#55555d` | Past/ended lines. |
| `--lyric-color-active` | `#f1f1f4` | Bright current-line text. |
| `--lyric-color-sung` | `var(--accent)` | Sung words and fill. |
| `--lyric-line-gap` | `14px` | Space between lines. |
| `--lyric-transition` | color/opacity/font-size/transform 180 ms ease | Line transitions. |
| `--lyric-transition-fast` | color 120 ms linear | Segment transitions. |

Visual rules:

- Upcoming lines are dim; past lines are dimmer; the current line is full opacity, slightly larger,
  and shifted right.
- Ended primary lines are dimmed.
- The current line's unsung words use `--lyric-color-active`, so the whole line reads as highlighted
  while the accent fill sweeps through it.
- Sung segments use `--lyric-color-sung`.
- The active segment uses `background-clip: text` with a left-to-right gradient: sung color up to
  `--progress`, active color after it. `-webkit-text-fill-color: transparent` reveals the gradient;
  `color` stays opaque so leaving the active state never flashes dark.
- Plain documents are static: no highlight, no seek cursor.
- Now Playing uses a 280 px cover column beside the lyrics; at ≤ 820 px it stacks the cover/meta above
  the lyrics.
- The bottom-bar track target gets hover/focus styling and a pointer cursor.

For lyric presentation, JavaScript never sets inline visual styles except the `--progress` custom
property. (The virtual list and layout code still set structural inline styles such as position and
transform.)

---

## 10. Shared lyric core (`src/shared/lyrics`)

This module is pure: no DOM, Electron, audio, or filesystem APIs.

### Types

- `LyricFormat = 'plain' | 'lrc' | 'enhanced-lrc'`.
- `LyricSegment { text, start, end, spaceAfter }` — times in seconds; `text` has no trailing
  whitespace.
- `LyricLine { index, start, end, endIsEstimated, text, segments?, agent?, translations? }`.
- `LyricMetadata { title?, artist?, album?, author?, offsetMs?, raw }`.
- `LyricDocument { format, timed, metadata, lines, warnings }`.
- `LyricParseOptions { applyOffset?, maxEstimatedLineSeconds?, lastLineSeconds? }`.

### Parsing (`parse.ts`)

- Normalizes BOM and CRLF/CR to LF.
- Parser registry order: enhanced LRC → LRC → plain (plain always matches).
- Defaults: `applyOffset: true`, `maxEstimatedLineSeconds: 10`, `lastLineSeconds: 5`.
- `detectLyricFormat(text)` and `parseLyrics(text, options?)` are the public entry points.

### Timestamps (`time.ts`)

- Line timestamps: `[m:ss]` or `[m:ss.fff]` with 1+ fractional digits.
- Inline word timestamps: `<m:ss.fff>`.
- Multiple leading timestamps are supported.
- Fractional digits are treated as a decimal fraction.
- `[offset:]` accepts an optional sign and integer milliseconds.

### Parsers

- **Plain** — trims non-empty body lines, `timed: false`, `start = end = 0`.
- **LRC** — reads every leading timestamp and emits one line per timestamp; text after timestamps is
  the line text.
- **Enhanced LRC** — line timestamps plus inline word markers:
  - Optional `vN:` singer prefix becomes `agent`.
  - Segments are built from text between markers.
  - `spaceAfter` is true when the raw segment had trailing whitespace.
  - A trailing empty marker becomes the line's explicit end.
  - Multiple line timestamps duplicate the line with shifted segment and end times.

### Finalization (`parsers/shared.ts`)

- Header tags are recognized anywhere as `[letters:value]`, so timed lines never match.
- Metadata tags: `ti`, `ar`, `al`, `by`, `offset`; every tag is preserved in `metadata.raw`.
- Invalid offsets produce a warning and are ignored.
- Lines sort by start, then input order.
- Line end: explicit end when available; otherwise `min(next.start, start + maxEstimatedLineSeconds)`;
  the last line gets `start + lastLineSeconds`. `endIsEstimated` records which case applied.
- Segment end = next segment's start, or the line end for the final segment.
- Offsets are applied by subtracting `offsetMs / 1000` from line and segment times when
  `applyOffset` is true.
- Odd/skipped input becomes a human-readable warning, never an exception.

### Sync helpers (`sync.ts`)

| Function | Behavior |
| --- | --- |
| `findActiveLineIndex(doc, t)` | Binary search for the last line starting at or before `t`; stays on that line through gaps; `-1` when not timed/empty/non-finite. |
| `findActiveLineIndexes(doc, t)` | Every line with `start <= t < end`, including overlaps. |
| `findActiveSegmentIndex(line, t)` | Last segment starting at or before `t`; `-1` when none. |
| `segmentProgress(segment, t)` | Clamped `0..1` progress through a segment. |
| `lineProgress(line, t)` | Clamped `0..1` progress through a line. |

---

## 11. Key flows

### 11.1 Startup

1. Main registers the privileged `media` scheme.
2. Main loads settings and the library cache, then restores the cached snapshot for the last folder.
3. Main installs the media handler, IPC, and creates the window.
4. Preload exposes `window.library`.
5. Renderer subscribes to library events, loads settings, applies view/sort, then calls `getState`.
6. `getState` triggers a one-time background refresh; the cached library is already visible.
7. When the refresh finishes, `library:updated` replaces the snapshot and the UI re-renders.

### 11.2 Open folder / rescan

1. Renderer disables scan buttons and calls `openFolder()`/`rescan()`.
2. Main shows the dialog (open only), canonicalizes the path, and scans.
3. Main streams throttled progress events.
4. On completion, main applies the snapshot, writes the cache, optionally persists the folder, and
   returns the snapshot.
5. Renderer applies the snapshot, reconciles the queue, refreshes views, and re-enables controls.
6. Cancelling the folder dialog returns `null`; the renderer re-enables controls and leaves the
   current view (including Now Playing) untouched.

### 11.3 Track start and playback

1. Clicking a track queues either the album or the visible track list and sets the index.
2. `startCurrentTrack` loads the URL, calls `lyricsController.setTrack(track.id)`, resets time UI,
   updates Now Playing/highlight, and starts playback.
3. Engine events update controls, time labels, duration, and advance on `ended`.
4. A failed `play()` or media error skips to the next track; `AbortError` is ignored.
5. If the library refresh removes the current track, `reconcileQueue` resets playback.

### 11.4 Lyric load and display

1. `setTrack` checks the LRU cache; a hit applies immediately.
2. A miss sets `loading` and invokes `lyrics:get`.
3. Main resolves the path from the library index and reads embedded tags.
4. Main returns `{ text, source }` or `null`; the renderer parses and caches the result.
5. If Now Playing is open, the controller subscription renders the new state:
   - `ready` → build/sync the document and start the frame loop,
   - `loading` → “Loading lyrics…”,
   - `none` → “No lyrics found”.
6. Responses for tracks that are no longer current are discarded by the generation check.

### 11.5 Now Playing open/close

1. Clicking the bottom-bar cover/title (or pressing Enter/Space on it) opens Now Playing.
2. `showSection` displays only the Now Playing view; the player bar stays visible.
3. The hidden library DOM is not re-rendered, preserving scroll/search/view.
4. If a library snapshot arrives while open, `libraryDirtyWhileNowPlaying` is set and the screen stays
   on Now Playing.
5. The close button or `Escape` closes it; if the library changed, the screen re-renders, otherwise the
   previous section is shown exactly as it was.
6. Navigating (open album/artist, back, switch view, search, open folder) closes Now Playing first.

---

## 12. UI structure and interaction map

`src/renderer/index.html` contains:

- **Toolbar** — Open Folder, Rescan, status, scan progress, view switcher, sort select, search.
- **Albums view** — album grid + empty state.
- **Artists view** — artist list + empty state.
- **Tracks view** — virtualized track list + empty state.
- **Album detail** — back button, cover, title/artist/year, ordered track list.
- **Artist detail** — back button, artist name/counts, album grid.
- **Now Playing** — close button, large cover, title/artist/album, lyric status/scroller.
- **Player bar** — clickable current-track target, Previous/Play/Pause/Next, time, seek, duration,
  volume.
- **Audio element** — hidden `<audio id="audio">`.

Keyboard:

| Key | Action |
| --- | --- |
| `Ctrl/Cmd+F` | Focus and select search. |
| `/` | Focus search when not in a text input. |
| `Escape` | Close Now Playing if open; otherwise clear search if focused/non-empty. |
| `Enter`/`Space` | Activate the bottom-bar target or a focused lyric line. |

Accessibility details:

- View buttons use `aria-pressed`.
- Playing tracks use `aria-current="true"`.
- Lyric lines are focusable buttons only when timed.
- Focus-visible outlines use the accent color.
- Status/progress elements use `role="status"`.

---

## 13. Persistence and on-disk layout

All paths are under Electron `userData`.

| Path | Contents | Write strategy |
| --- | --- | --- |
| `settings.json` | `lastFolder`, `volume`, `lastView`, `sortByView`. | Normalized, atomic. |
| `library-cache.json` | Version, folder, per-path tag entries with `mtimeMs`/`size`. | Validated, atomic. |
| `covers/<albumId>.jpg` | Full cover, max width 300 px, JPEG 85. | Atomic. |
| `covers/<albumId>-small.jpg` | Small cover, max width 96 px, generated from full. | Atomic. |

The cache is keyed by absolute path. Entries are reused only when both `mtimeMs` and `size` match;
otherwise tags are re-read. Files that no longer exist are naturally dropped because a scan rebuilds
the entry map from the current directory walk.

---

## 14. Security and robustness

- **Context isolation + sandbox + no Node integration** in the renderer.
- **CSP** restricts scripts to self, styles to self/inline, images to self/data/media, and media to
  self/media.
- **No renderer paths**: ids only; main resolves and validates.
- **Path containment** in `media://` uses `realpath` on both the file and the root, then
  `isPathInside`.
- **Symlinks are skipped** during scanning, preventing cycles and escapes.
- **Only `.flac` regular files** are served.
- **IPC input validation**: track ids must be non-empty strings; volume is clamped; UI state is
  normalized; malformed lyric ids return `null`.
- **Tolerant persistence**: bad JSON, wrong cache versions, and malformed entries degrade to defaults
  instead of crashing.
- **Atomic writes** avoid partially written settings/cache/cover files.
- **Cancellable scans** prevent stale results from overwriting newer libraries.
- **Stale async responses** are ignored in both the scan coordinator and the lyric controller.
- **Playback failure isolation**: one unreadable track is logged and skipped, not fatal.
- **Image fallbacks**: failed covers hide the `<img>` and show the `♪` placeholder.

---

## 15. Performance characteristics

- Tag reads: up to **8** concurrent files.
- Cache reuse: unchanged files are not parsed again.
- Progress events: at most one per 100 ms (final event always sent).
- Covers: full and small JPEGs cached; small derived from full; in-flight requests deduplicated.
- Track list: virtualized; only visible rows plus overscan exist in the DOM.
- Library queries: index built once per snapshot; each keystroke only filters and sorts.
- Lyrics: fetched on demand; parsed documents cached (LRU, 10); one rAF loop while visible.
- Lyric DOM: built once per document; each frame reads the position once, runs the binary searches,
  and does one O(lines) flag pass whose DOM writes happen only for changed state.
- Auto-scroll: one smooth scroll per primary-line change; manual scrolling pauses it for 4 s.
- Cover images: lazy-loaded/async-decoded where applicable.

---

## 16. Testing strategy

Tests use **Vitest** and target pure logic plus the DOM-free controller. They run in the Node
environment; nothing mocks Electron or the DOM. The tested modules either have no imports beyond
`node:*` and shared types, or keep their Electron access outside the tested functions.

| File | Coverage |
| --- | --- |
| `tests/albums.test.ts` | Grouping by album artist + album title; `albumArtist` used verbatim (the artist fallback happens in `tags.ts`); disc/track/title ordering; album title sorting; first non-null year; deterministic 40-hex ids and cover URLs; input array not reordered. |
| `tests/cache.test.ts` | Empty/missing cache; malformed JSON; wrong version; invalid folder and tracks containers; malformed entries dropped individually; nullable track/disc/year fields; save/load round-trip. |
| `tests/ids.test.ts` | Known SHA-1 digests; determinism; 40 lowercase hex characters; different inputs produce different ids. |
| `tests/json-file.test.ts` | Missing and malformed JSON fall back; valid JSON parses; atomic string and binary writes; parent-directory creation; overwrite; no temporary files left behind; pretty-printed JSON. |
| `tests/lyrics.test.ts` | Both fixtures; format detection; metadata; word segments and agents; fractional timestamps; overlapping lines; gap behavior; offsets; warnings; sync helpers and progress clamps. |
| `tests/lyricsController.test.ts` | Stale-response guard; parsed-document reuse; LRU eviction; cached “none”; empty text; timed parsing; reset behavior. |
| `tests/query.test.ts` | `normalizeText`; every-word and order-independent search; substring matching; empty search; all three views and every sort key; unknown-sort fallback; exact album-artist grouping (`"A, B"` separate from `"A"`); album search by track title; view/sort validators and defaults. |
| `tests/queue.test.ts` | Start-index clamping (negative, past end, fractional, non-finite); empty queue; next/previous at both ends; `hasNext`/`hasPrevious`; input-array copy; `getTracks`/`getCurrentIndex`. |
| `tests/range.test.ts` | `start-end`, open-ended, and suffix ranges; end beyond file size; suffix larger than the file; start beyond file size; malformed and multiple ranges; zero-size files; non-safe integers. |
| `tests/segmentGroups.test.ts` | Syllable grouping; `spaceAfter` boundaries; trailing final group; empty input. |
| `tests/settings.test.ts` | Volume clamping; missing/malformed files; invalid fields; empty sort values dropped; folder and view fallbacks; save normalization. Documents that unknown view and sort keys currently pass through main-side normalization and are validated by the renderer. |

Tests that pin behavior which conflicts with a stated invariant are marked with an inline comment
rather than changing production code.

Fixtures:

- `tests/fixtures/LineByLine.txt` — line-timed LRC.
- `tests/fixtures/TimedWordByWord.txt` — enhanced LRC with singer labels and overlapping lines.

Run with:

```bash
npm test
```

Type-check both projects with:

```bash
npm run typecheck
```

The end-to-end smoke tests live outside the repository (temporary Electron/CDP scripts) and verify
the built app against generated FLAC fixtures. They are not part of `npm test`.

---

## 17. Extension guide

### Where to make a change

| If you need to change… | Start here |
| --- | --- |
| Folder walking, tag reuse, snapshots, path index | `src/main/library.ts` |
| Tag fields and fallbacks | `src/main/tags.ts` |
| Album grouping/order | `src/main/albums.ts` |
| Cover extraction, resizing, cache | `src/main/covers.ts` |
| `media://` URLs, range responses | `src/main/media-protocol.ts`, `src/main/range.ts` |
| IPC channels or preload surface | `src/main/index.ts`, `src/preload/index.ts`, `src/shared/types.ts` |
| Persistence format or validation | `src/main/settings.ts`, `src/main/cache.ts`, `src/main/json-file.ts` |
| Views, search, sort definitions | `src/renderer/library/query.ts` |
| Routing, transport wiring, Now Playing lifecycle | `src/renderer/src/main.ts` |
| Playback backend or queue behavior | `src/renderer/player/engine.ts`, `src/renderer/player/queue.ts` |
| Lyric fetch, parse state, LRU cache | `src/renderer/lyrics/lyricsController.ts` |
| Lyric parsing/sync (stable core) | `src/shared/lyrics/` |
| Lyric DOM, class toggles, scroll, seek | `src/renderer/ui/lyricView.ts` |
| Lyric/Now Playing visual styling | `src/renderer/styles/lyrics.css` |
| App shell markup, CSP, element ids | `src/renderer/index.html` |

### Add a lyric source (e.g. sidecar `.lrc`)

1. Implement `LyricResolver` in `src/main/lyricsSource.ts`:

   ```ts
   async function sidecarResolver(track: LyricsTrack): Promise<LyricsResult | null> {
     // read `${track.filePath}.lrc` or a sibling `.lrc`
     return text ? { text, source: 'sidecar' } : null
   }
   ```

2. Add it to `RESOLVERS` in the desired priority order.
3. Return `null` (or an empty string) when unavailable; do not throw for expected misses.
4. No IPC or renderer changes are needed.

### Add a library view

1. Extend `LibraryView` and add an entry to `VIEWS` in `src/renderer/library/query.ts` with a label,
   default sort, sort map, and item builder.
2. Add a section to `index.html`, include it in `showSection`/`currentSection`, and render it in
   `main.ts`.
3. Add a view button with `data-view` and a `LibraryView` value.

### Add a sort option

1. Add a `SortOption` entry to the relevant `VIEWS[view].sorts`.
2. The dropdown, validation, and persistence pick it up automatically.

### Replace the playback backend

Implement `PlaybackEngine` and construct it in `main.ts` instead of `HtmlAudioEngine`. The lyric view
only needs `getPosition` and `seek`; the rest of the UI uses the interface.

### Add a persisted setting

1. Extend `Settings` in `src/shared/types.ts`.
2. Add validation/defaults in `src/main/settings.ts`.
3. Add an IPC handler if the renderer writes it, and expose it in the preload `LibraryApi`.
4. Read it during renderer initialization and save on change.

---

## 18. Known limitations and deliberate omissions

- Lyric line ends are estimated when the file does not provide them (capped at 10 s; final line 5 s).
- Word-level progress exists only for enhanced LRC with inline markers.
- Singer labels (`v1:`) are parsed into `agent` and exposed as `data-agent`, but not styled or shown
  as separate voices.
- Translations and TTML are typed/reserved but not parsed.
- Plain lyrics are static: no highlighting and no click-to-seek.
- No sidecar `.lrc`, online lookup, lyric editing, or tag writing.
- No shuffle, repeat, gapless playback, crossfade, queue panel, or media-key integration.
- No packaging/distribution configuration.
- Album/artist grids are not virtualized.
- Search is exact-word substring matching, not fuzzy.
- Multi-artist strings are not split; they remain one artist key.

---

## 19. Verification checklist

Before merging a change:

```bash
npm run typecheck
npm test
npm run build
npm run dev        # manual smoke: open a folder, play tracks, open Now Playing
```

Expected:

- Type-check passes for both projects.
- All Vitest files pass (currently 180 tests across 11 files).
- Production bundles build into `out/`.
- `npm run dev` opens the app with no console errors.
- Lyrics still load for line, word, and plain fixtures; missing lyrics shows the empty state.
- Now Playing open/close preserves search, view, and scroll.
