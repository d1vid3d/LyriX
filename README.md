# LyriX

A minimal desktop player for local FLAC files, built with Electron, electron-vite and plain
TypeScript/HTML/CSS. It reads tags, groups tracks into albums, shows cover art and remembers the
last folder and volume between launches.

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
| `src/main/albums.ts` | Pure album grouping and sorting (album artist + album, disc/track). |
| `src/main/cache.ts` | Versioned library cache at `userData/library-cache.json`. |
| `src/main/settings.ts` | Settings at `userData/settings.json` (last folder and volume). |
| `src/main/covers.ts` | Extracts/resizes cover art and caches JPEGs in `userData/covers`. |
| `src/main/json-file.ts` | Tolerant JSON reads and atomic writes. |
| `src/main/ids.ts` | Stable SHA-1 ids for file paths and albums. |
| `src/main/media-protocol.ts` | `media://` protocol for tracks and covers, with HTTP range support. |
| `src/main/range.ts` | Parses `Range` headers for partial-content responses. |
| `src/preload/index.ts` | Exposes the typed `window.library` API via `contextBridge`. |
| `src/preload/index.d.ts` | Global `Window` typing for the preload API. |
| `src/renderer/index.html` | App shell: toolbar, album grid, album detail and player controls. |
| `src/renderer/src/main.ts` | Album/detail rendering, playback, scanning UI and volume persistence. |
| `src/renderer/src/style.css` | Dark theme and application layout. |
| `src/shared/types.ts` | Types shared by main, preload and renderer (no runtime code). |

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
then ordered by disc and track number. Albums are sorted by title. The grid loads cover images
lazily, and clicking an album opens its track list.

Cover art is extracted from an embedded picture in the album's tracks (the first few are checked).
If none is found, LyriX looks for `cover.jpg`, `folder.jpg` or `front.jpg` in the album's folder. The
image is resized to about 300 px wide and cached as a JPEG in `userData/covers`. Albums without art
show a placeholder.

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

The bottom bar shows the current track, artist and cover. The last folder and volume are stored in
`userData/settings.json` and restored on the next launch.

## Out of scope (for now)

Queues, next/previous, auto-advance, search, lyrics, tag editing and packaging are intentionally
not implemented.
