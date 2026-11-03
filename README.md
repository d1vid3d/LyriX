# LyriX

Notice: This project is still in early development and may be unstable. It is not yet packaged for distribution. As it stands it is a proof-of-concept for a local FLAC player with lyrics support. Tech stack, API, architecture and features may change significantly before a stable release.

A minimal desktop player for local FLAC files, built with Electron, electron-vite and plain
TypeScript/HTML/CSS. It reads tags, groups tracks into albums, shows cover art, offers album,
artist and track views with search and sorting, and remembers the last folder, volume and view
between launches.

## Requirements

- Node.js 22.12+ (tag reading uses `music-metadata`, which requires Node 22+)
- npm

## Run

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run typecheck   # type-check main/preload and renderer
npm run build       # bundle into out/
npm start           # preview the production bundle
npm test            # run the Vitest suite
```

## Project structure

| Path | Description |
| --- | --- |
| `package.json` | Scripts, Electron entry point and dependencies. |
| `electron.vite.config.ts` | electron-vite build configuration; bundles `music-metadata` into the main process. |
| `tsconfig.json` | Root project references for editor tooling. |
| `tsconfig.node.json` | TypeScript config for the main process, preload and shared types. |
| `tsconfig.web.json` | TypeScript config for the renderer and preload global declarations. |
| `src/main/index.ts` | App startup, IPC, background refresh and scan coordination. |
| `src/main/library.ts` | Recursive `.flac` scanning, cache reuse, album snapshots and path containment. |
| `src/main/tags.ts` | Reads tags with `music-metadata` and applies filename/unknown fallbacks. |
| `src/main/lyricsSource.ts` | Ordered lyric resolvers; reads embedded `LYRICS`/`UNSYNCEDLYRICS` tags on demand. |
| `src/main/albums.ts` | Pure album grouping and sorting (album artist + album, disc/track). |
| `src/main/cache.ts` | Versioned library cache at `userData/library-cache.json`. |
| `src/main/settings.ts` | Settings at `userData/settings.json` (last folder, volume, last view and per-view sort). |
| `src/main/covers.ts` | Extracts/resizes cover art and caches full and thumbnail JPEGs in `userData/covers`. |
| `src/main/json-file.ts` | Tolerant JSON reads and atomic writes. |
| `src/main/ids.ts` | Stable SHA-1 ids for file paths and albums. |
| `src/main/media-protocol.ts` | `media://` protocol for tracks and covers, with HTTP range support. |
| `src/main/range.ts` | Parses `Range` headers for partial-content responses. |
| `src/preload/index.ts` | Exposes the typed `window.library` API via `contextBridge`. |
| `src/preload/index.d.ts` | Global `Window` typing for the preload API. |
| `src/renderer/index.html` | App shell: toolbar with view/sort/search, album grid, artists, tracks, detail views and player controls. |
| `src/renderer/library/query.ts` | Pure library index, view/sort registry, normalized search and filtering (no DOM). |
| `src/renderer/ui/virtualList.ts` | Fixed-row virtual scroller used by the tracks view. |
| `src/renderer/player/engine.ts` | `PlaybackEngine` interface and the single-`HTMLAudioElement` implementation. |
| `src/renderer/player/queue.ts` | Pure album queue with a current index and bounded next/previous. |
| `src/renderer/lyrics/lyricsController.ts` | On-demand lyric fetch/parse state, stale-response guard and LRU document cache (no DOM). |
| `src/renderer/lyrics/segmentGroups.ts` | Pure grouping of word-timed segments into nowrap word containers. |
| `src/renderer/ui/lyricView.ts` | Builds lyric DOM once, syncs line/segment classes and progress, centers and seeks. |
| `src/renderer/styles/lyrics.css` | Lyric colors, sizes, transitions, progress fill and Now Playing layout. |
| `src/renderer/src/main.ts` | View routing, rendering, search/sort, queue/transport wiring, scanning UI and UI-state persistence. |
| `src/renderer/src/style.css` | Dark theme and application layout. |
| `src/shared/types.ts` | Types shared by main, preload and renderer (no runtime code). |
| `src/shared/lyrics/types.ts` | Lyric format, document, line, segment, metadata and parse-option types. |
| `src/shared/lyrics/time.ts` | Timestamp token parsing, fraction handling and format-detection regexes. |
| `src/shared/lyrics/parse.ts` | `parseLyrics` entry point, option defaults and the ordered parser registry. |
| `src/shared/lyrics/parsers/shared.ts` | Header extraction, timed-line finalization, end estimation and offset shifting. |
| `src/shared/lyrics/parsers/plain.ts` | Untimed plain-text parser. |
| `src/shared/lyrics/parsers/lrc.ts` | Line-timed LRC parser with estimated line ends. |
| `src/shared/lyrics/parsers/enhanced-lrc.ts` | Word-timed enhanced LRC parser with `vN:` singer prefixes. |
| `src/shared/lyrics/sync.ts` | Active line/segment lookup and clamped progress helpers. |
| `src/shared/lyrics/index.ts` | Public exports for the pure lyric core. |
| `tests/lyrics.test.ts` | Vitest coverage for both fixtures, inline edge cases and sync helpers. |
| `tests/lyricsController.test.ts` | Vitest coverage for stale responses, caching, eviction and missing lyrics. |
| `tests/segmentGroups.test.ts` | Vitest coverage for word-container grouping and trailing whitespace. |

## How the library works

After a folder is selected, the main process walks it for `.flac` files (skipping symlinks) and
reads tags with `music-metadata`, at most eight files at a time. Missing tags fall back to the
filename for the title and `Unknown Artist` / `Unknown Album`; one unreadable file is reported and
does not stop the scan.

Tag data is cached in `userData/library-cache.json`, keyed by absolute path with the file's
`mtimeMs` and size. Files whose timestamp and size are unchanged are not read again, and files that
no longer exist are dropped. The cache has a schema version and is written atomically. On startup
the cached library is shown immediately and a background refresh runs; **Rescan** repeats the scan
on demand. The header shows `Scanning X / Y` while a scan is running.

Tracks are grouped in the main process by album artist (falling back to artist) plus album title,
then ordered by disc and track number. Albums arrive sorted by title and the renderer can re-sort them
per view. The grid loads cover images lazily, and clicking an album opens its track list.

Cover art is extracted from an embedded picture in the album's tracks (the first few are checked).
If none is found, LyriX looks for `cover.jpg`, `folder.jpg` or `front.jpg` in the album's folder. The
image is resized to about 300 px wide and cached as a JPEG in `userData/covers`. The tracks view and
the now-playing bar request `media://cover/<id>?size=small`, a separate ~96 px JPEG generated from the
large cache and reused. Albums without art show a placeholder.

## Browsing, search and sorting

The header switches between **Albums**, **Artists** and **Tracks**; the sort dropdown depends on the
view (albums: title/artist/year, artists: name/track count, tracks: title/artist/album). Sort order is
remembered per view, and the active view and sorts are stored in `userData/settings.json`; the search
text never is.

Search is debounced by 150 ms and matched against precomputed text: track title, artist and album for
tracks; album title, album artist and track titles for albums; artist name and album titles for
artists. Matching ignores case, surrounding whitespace, diacritics and repeated spaces, and every
query word must be present. **Ctrl+F** or **/** focuses the search box; **Escape** clears it. Search
stays applied when switching views or opening and closing details.

Artists are grouped by the exact album-artist string, so a value such as `"A, B"` remains one artist;
each row shows the artist's album and track counts, and opening one lists that artist's albums in the
normal grid. The tracks view is a flat, fixed-height list with a small cover, title, artist, album and
duration; it is virtualized, so only the visible rows plus a small overscan buffer exist in the DOM.
Clicking a track queues exactly the currently visible filtered and sorted list, and the playing row is
highlighted.

## Lyric core

`src/shared/lyrics` is a pure module: it takes lyric text and returns a typed document, with no DOM,
Electron, audio or filesystem APIs. Both processes can import it later.

`parseLyrics(text, options?)` detects three formats with an ordered parser registry: enhanced LRC
(line timestamps plus `<mm:ss.xxx>` word markers), line-level LRC, and plain untimed text. It reads
`[ti:]`, `[ar:]`, `[al:]`, `[by:]` and `[offset:]` headers (keeping every tag in `metadata.raw`),
supports several leading timestamps on one line, optional `vN:` singer labels, and 1+ digit
fractions. Positive offsets move timestamps earlier; `applyOffset: false` keeps file times.

Line-level ends come from the next timestamp, capped at 10 seconds by default; the last line gets
five seconds. Enhanced lines use their final empty word marker as an exact end, otherwise estimate
the same way. Skipped or odd input becomes a human-readable warning instead of an exception.

`sync.ts` provides frame-friendly helpers: `findActiveLineIndex` (binary search that deliberately
stays on the previous line during gaps), `findActiveLineIndexes` (all lines containing a time,
including overlaps), `findActiveSegmentIndex`, and clamped `lineProgress` / `segmentProgress`.

## Lyrics and Now Playing

Lyrics are read only when a track starts, never during scanning and never stored in the library
cache. `src/main/lyricsSource.ts` runs ordered resolvers and returns the first non-empty result; the
current resolver reads `common.lyrics` first and then native `LYRICS` / `UNSYNCEDLYRICS` tags
(case-insensitive) with `music-metadata`, skipping covers. A sidecar `.lrc` resolver can be added as
one more list entry. The `lyrics:get` IPC accepts only a track id, resolves the path in the main
process and returns `null` instead of throwing.

The renderer controller fetches and parses on each current-track change, ignores responses for a
track that is no longer current, and caches the last 10 parsed documents (including “none”). It
contains no DOM code. `LyricView` builds the line DOM once per document, keeps word containers
unbreakable, and toggles only changed line/segment classes from `requestAnimationFrame`, reading the
position from the `PlaybackEngine`. The current line is centered with smooth scrolling; manual
wheel/touch/drag pauses centering for four seconds. Clicking a timed line seeks to its start without
changing play/pause. Plain documents are static and not clickable.

Clicking the cover/title in the bottom bar opens Now Playing in the main content area; the player bar
stays visible. The close button or **Escape** restores the previous view without re-rendering it, so
search text and scroll positions survive. The view updates live as tracks change, shows
“Loading lyrics…” / “No lyrics found”, and stacks the cover above the lyrics on narrow windows. All
lyric styling lives in `src/renderer/styles/lyrics.css`; JavaScript only sets classes and the
`--progress` variable.

## How local playback works

The renderer never touches the filesystem. It receives `media://track/<id>` and
`media://cover/<id>` URLs; the ids are derived from absolute paths or album keys, so the renderer
never sees a real path.

The custom scheme is registered as standard, secure and streaming, so an `<audio>` element can play
it. Requests are served by `protocol.handle` in `src/main/media-protocol.ts`, which:

- resolves the id back to a real file and rejects anything outside the folder the user selected
  (including symlink escapes),
- only serves regular `.flac` files,
- responds with `206 Partial Content` and `Content-Range` for byte ranges, which makes seeking work,
- serves covers only from the generated cover cache.

The bottom bar shows the current track, artist and a small cover. Clicking a track in an album queues
the whole album in disc/track order; clicking one in the tracks view queues the visible list.
Playback advances automatically when a track ends and stops at the end of the last track.
**Previous** restarts the current track when it is more than three seconds in, otherwise it moves back
one track. If a file cannot be played, the player logs it and skips forward until it finds a playable
track. The last folder, volume, view and per-view sort are stored in `userData/settings.json` and
restored on the next launch.

## Out of scope (for now)

Shuffle, repeat modes, gapless playback, crossfade, a visible queue panel, queue editing, fuzzy
search, search history, filters, artist images, splitting multi-artist values, genres, grid/artist
virtualization, sidecar `.lrc` loading, online lyric lookup, singer-specific lyric styling,
translations, TTML, tag editing and packaging are intentionally not implemented.
