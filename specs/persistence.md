# Persistence and On-Disk Layout

**Purpose:** every file LyriX writes under Electron `userData`, its format, validation rules, and the
atomic-write helpers shared by all stores.

**Owning source paths:** `src/main/cache.ts`, `src/main/settings.ts`, `src/main/lyrics/choices.ts`,
`src/main/json-file.ts`.

**Last verified:** 2026-11-06 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](TechnicalSpecs.md) (invariants 6 and 8),
[data-model.md](data-model.md), [main/library-scanning.md](main/library-scanning.md),
[main/covers-and-media.md](main/covers-and-media.md), [main/lifecycle-and-ipc.md](main/lifecycle-and-ipc.md).

## On-disk layout

All paths are under Electron `userData`.

| Path | Contents | Write strategy |
| --- | --- | --- |
| `settings.json` | `lastFolder`, `volume`, `lastView`, `sortByView`, `lyricPreference`, `translationEnabled`, `translationLanguage`. | Normalized, atomic. |
| `library-cache.json` | Version, folder, per-path tag entries with `mtimeMs`/`size`. | Validated, atomic. |
| `lyric-choices.json` | Version 1 plus `tracks` and optional `translations`: `Record<trackId, sourceId>`. | Validated, atomic, capped at 5000 entries per map. |
| `covers/<albumId>.jpg` | Full cover JPEG. Dimensions and quality are owned by [main/covers-and-media.md](main/covers-and-media.md). | Atomic. |
| `covers/<albumId>-small.jpg` | Small cover JPEG, generated from the full cover. Dimensions are owned by [main/covers-and-media.md](main/covers-and-media.md). | Atomic. |

The cache is keyed by absolute path. Entries are reused only when both `mtimeMs` and `size` match;
otherwise tags are re-read. Files that no longer exist are naturally dropped because a scan rebuilds
the entry map from the current directory walk.

Sidecar `.lrc` files are user-owned inputs and are never written by LyriX. Per-track source and
translation choices are independent of the library cache, so they survive rescans and
path-preserving tag updates. A missing `translations` map is equivalent to an empty one.

## Library cache (`src/main/cache.ts`)

- Schema version `1`.
- `loadLibraryCache` validates the version, folder type, and every entry; malformed entries are
  dropped individually. Invalid top-level data yields an empty cache.
- `saveLibraryCache` writes atomically.
- `CachedTrack` field meanings and the `LibraryCache` shape are in [data-model.md](data-model.md).

## Settings (`src/main/settings.ts`)

Defaults:

- `lastFolder: null`
- `volume: 1`
- `lastView: 'albums'`
- `sortByView: {}`
- `lyricPreference: 'sidecar'`
- `translationEnabled: false`
- `translationLanguage: null`

Normalization rules:

- `clampVolume` keeps `[0, 1]` and replaces non-finite values with `1`.
- `normalizeUiState` keeps only string view names and non-empty string sort values.
- `normalizeTranslationLanguage` accepts only `/^[A-Za-z0-9_-]{1,32}$/`; anything else becomes `null`.
- `translationEnabled` is true only for the boolean `true`.
- `normalize` validates the folder string, clamps volume, merges normalized UI state, validates the
  lyric preference, and normalizes both translation fields.
- Reads use `readJsonFile`; writes use `writeJsonAtomic` with normalization.

Unknown view and sort keys currently pass through main-side normalization and are validated by the
renderer ([renderer/library-query-and-lists.md](renderer/library-query-and-lists.md)); the test that
pins this behavior is listed in [testing-and-verification.md](testing-and-verification.md).

## Lyric choice store (`src/main/lyrics/choices.ts`)

`LyricChoiceStore` for `userData/lyric-choices.json`.

- Shape: `{ version: 1, tracks: Record<trackId, sourceId>, translations?: Record<trackId, sourceId> }`.
- A missing `translations` map is treated as empty; existing `tracks` choices survive.
- Tolerant read: bad JSON, wrong version, or malformed containers become empty maps.
- Source ids must be `embedded` or `sidecar:` followed by a file name with no path separators, at
  most 255 characters. Invalid ids are ignored.
- Writes atomically and caps each map independently at 5000 entries by dropping the oldest.
- API: `get`, `set`, `clear`, `getTranslation`, `setTranslation`, `clearTranslation`.

The provider side that produces these ids is documented in [main/lyric-sources.md](main/lyric-sources.md).
The renderer side that persists and consumes them is documented in
[renderer/lyrics-controller.md](renderer/lyrics-controller.md).

## Atomic JSON helpers (`src/main/json-file.ts`)

- `hashId(value)` → lowercase SHA-1 hex lives in `src/main/ids.ts`; see [data-model.md](data-model.md).
- `readJsonFile(path, fallback)` returns the fallback on any read/parse error and only logs non-ENOENT
  failures.
- `writeFileAtomic(path, data)` writes a temp file in the same directory, renames it into place, and
  removes the temp file on failure.
- `writeJsonAtomic` writes pretty-printed JSON via the same path.

These helpers implement invariant 6 in [TechnicalSpecs.md](TechnicalSpecs.md). Covers use the same
atomic-write path when materializing JPEGs; see [main/covers-and-media.md](main/covers-and-media.md).
