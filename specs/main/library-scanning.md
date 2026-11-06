# Library Scanning, Tags, Albums, and Scan Coordination

**Purpose:** how LyriX walks a folder, reuses cached tags, turns files into albums, and coordinates
cancellable scans with progress events.

**Owning source paths:** `src/main/library.ts`, `src/main/tags.ts`, `src/main/albums.ts`,
`src/main/scanCoordinator.ts`.

**Last verified:** 2026-11-06 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md) (invariants 2, 4, 7, 8),
[persistence.md](../persistence.md), [data-model.md](../data-model.md),
[main/covers-and-media.md](covers-and-media.md), [flows.md](../flows.md),
[performance.md](../performance.md).

## Library state and snapshots (`src/main/library.ts`)

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

The cache shape and reuse key are owned by [persistence.md](../persistence.md). The path index is
what lets the renderer work with ids only (invariant 1 in [TechnicalSpecs.md](../TechnicalSpecs.md)).

## Tag reading and fallbacks (`src/main/tags.ts`)

`readTrackTags(filePath, mtimeMs, size)` calls `parseFile` with duration and skips covers.

- Title falls back to the filename without extension.
- Artist falls back to `Unknown Artist`; album to `Unknown Album`; album artist to the artist.
- Track/disc/year become `null` when missing or non-finite; duration becomes `0`.
- Any read error is logged and returns the same filename/unknown fallbacks, so one bad file cannot
  abort a scan.

The resulting `CachedTrack` fields are defined in [data-model.md](../data-model.md).

## Album grouping (`src/main/albums.ts`)

- Groups by `${albumArtist}\u0000${album}` so same-titled albums by different artists stay separate.
- Album id = `hashId(key)`.
- Album year = first non-null track year.
- Tracks sort by disc (null → 1), then track number (null → last), then title.
- Albums sort by title with `localeCompare(..., { sensitivity: 'base', numeric: true })`.

The id formulas live in [data-model.md](../data-model.md). Cover URLs are generated here as
`media://cover/<id>` and served by [main/covers-and-media.md](covers-and-media.md).

## Scan coordination (`src/main/scanCoordinator.ts`)

- `runScan(folder, persistFolder)` increments the private generation counter; the `isCancelled`
  closure compares the captured generation with the current one.
- Delegates walking/tagging to `scanLibrary`, applies the result with `applyLibrary`, saves the cache,
  and optionally persists the folder.
- Progress events are throttled to one per 100 ms except for the final tick.
- `chooseFolder()` opens the directory dialog, canonicalizes the path when possible, and scans.
- `rescan()` re-scans the current root without changing the persisted folder.
- `refreshInBackground()` scans the restored root on startup and emits `library:updated` only when
  the scan was not superseded.

`library:updated` and the renderer's response are described in [flows.md](../flows.md); the IPC
channel surface is in [main/lifecycle-and-ipc.md](lifecycle-and-ipc.md).

The concurrency limit and throttle interval are performance contracts. Other specs link here rather
than repeating them ([performance.md](../performance.md)).
