# Shared Data Model

**Purpose:** cross-process types, persisted-state shapes, and the identity rules for tracks and
albums.

**Owning source paths:** `src/shared/types.ts`, `src/main/ids.ts`.

**Last verified:** 2026-11-06 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](TechnicalSpecs.md), [persistence.md](persistence.md),
[shared-lyric-core.md](shared-lyric-core.md), [main/lifecycle-and-ipc.md](main/lifecycle-and-ipc.md).

## Core types (`src/shared/types.ts`)

| Type | Fields / purpose |
| --- | --- |
| `Track` | `id`, `title`, `artist`, `album`, `albumArtist`, `trackNumber`, `discNumber`, `year`, `duration`, `url` (`media://track/<id>`). |
| `Album` | `id`, `title`, `artist` (album artist), `year`, `coverUrl` (`media://cover/<id>`), `tracks`. |
| `CachedTrack` | Tag values plus `mtimeMs` and `size` for cache validation. |
| `LibraryCache` | `version`, `folder`, `tracks: Record<absolutePath, CachedTrack>`. |
| `UiState` | `lastView`, `sortByView`. |
| `Settings` | `UiState` + `lastFolder`, `volume`, `lyricPreference`, `translationEnabled`, `translationLanguage`, `shuffle`, `repeat`. |
| `RepeatMode` | `"off"`, `"all"`, or `"one"` (shared by settings and the renderer queue). |
| `PlaybackSettingsInput` | `shuffle: boolean`, `repeat: RepeatMode` for the playback-settings IPC. |
| `TranslationSettingsInput` | `enabled: boolean`, `language: string \| null` for the translation IPC. |
| `ScanProgress` | `scanned`, `total`. |
| `LibrarySnapshot` | `folderName`, `albums`. |
| `LyricPreference` | `"sidecar"` or `"embedded"` (global auto-selection default). |
| `LyricSourceKind` | `"embedded"` or `"sidecar"`. |
| `LyricSourceOption` | `id`, `kind`, `label`, `detail`, `available`, `text`, `variant`; ids are `"embedded"` or `"sidecar:<file name>"` (file name only). `variant` is the text between the base name and `.lrc` as written, or `null` for embedded and the exact sidecar. |
| `LyricSources` | `trackId`, ordered `options`, `savedChoice`, `savedTranslationChoice`, `preference`, `expectedSidecarName` (file name only). |
| `LibraryApi` | Typed preload surface (see [main/lifecycle-and-ipc.md](main/lifecycle-and-ipc.md)). |

Queue-only types (`QueueEntry`, `QueueContext`, `QueueSnapshot`, `QueueOrigin`) live in
`src/renderer/player/queue/types.ts`; they are renderer-local and do not cross the process boundary.

The lyric document types (`LyricFormat`, `LyricDocument`, `LyricLine`, `LyricSegment`, and parse
options) live in [shared-lyric-core.md](shared-lyric-core.md); they are not duplicated here.

## Ids

Ids are 40-character lowercase SHA-1 hex strings:

- Track id = SHA-1 of the absolute file path.
- Album id = SHA-1 of `albumArtist + "\u0000" + album`.
- Both are validated with `/^[a-f0-9]{40}$/` before use.

`hashId(value)` in `src/main/ids.ts` returns the lowercase SHA-1 hex digest used by both rules. The
same 40-hex shape is re-checked by the IPC layer, the cover service, and the media protocol; those
call sites are described in their own specs and refer back to this contract.

## Where the model is produced

- Track/album objects are assembled in `src/main/library.ts` and `src/main/albums.ts`; album
  grouping and ordering are documented in [main/library-scanning.md](main/library-scanning.md).
- `LibrarySnapshot` is the only library shape that crosses to the renderer.
- Persisted `Settings` and `LibraryCache` fields are normalized/validated in `src/main/settings.ts`
  and `src/main/cache.ts`; see [persistence.md](persistence.md).
