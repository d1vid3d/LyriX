# LyrixData: Portable Library Data (Foundation and Favorites)

**Purpose:** the library-resident `LyrixData` folder, its safe file layer, portable track references,
status states, favorites storage, and the main-process IPC that keeps renderer payloads id-only.

**Owning source paths:** `src/main/lyrixdata/` (`paths.ts`, `trackRef.ts`, `fsAdapter.ts`,
`versionedStore.ts`, `formats.ts`, `lyrixDataStore.ts`, `favoritesStore.ts`, `favoritesIpc.ts`,
`machineId.ts`), `src/main/library.ts`, `src/main/scanCoordinator.ts`, `src/main/index.ts`,
`src/main/ipc.ts`.

**Last verified:** 2026-11-08 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md) (invariants 1, 2, 6, 8, and 13),
[persistence.md](../persistence.md), [data-model.md](../data-model.md),
[main/lifecycle-and-ipc.md](lifecycle-and-ipc.md),
[renderer/favorites.md](../renderer/favorites.md),
[security-and-robustness.md](../security-and-robustness.md).

## On-disk layout

Everything lives in `<library>/LyrixData/` (case-insensitive directory name):

| File | Contents |
| --- | --- |
| `README.txt` | One paragraph: created by LyriX, safe to back up or delete, deleting resets favorites/history/playlists. |
| `library.json` | `{ version, libraryId, createdAt, writtenBy }`; `libraryId` is a random UUID kept stable. |
| `favorites.json` | `{ version, items: [{ ref, addedAt }], writtenBy }`. |

Every file has a numeric schema version and a `writtenBy` stamp
`{ app: 'LyriX', appVersion, machineId, at }`. `machineId` is a random UUID created once in
`userData/machine-id.json`; it is machine-local and never stored in the library. Unknown fields are
preserved on rewrite. Reads are tolerant; a corrupt main file falls back to `<file>.bak`, and two bad
copies read as empty. Writes go through a temp file in the same directory followed by a rename, keep
the previous file as `.bak`, and clean up the temp file on failure.

**Nothing is created until the first write.** Binding, reading, scanning, and browsing never create
the folder or any file.

## Portable track refs (`trackRef.ts`)

`TrackRef = { path, fp }`:

- `path` is relative to the library root, forward slashes, Unicode NFC, bounded and rejected when it
  could escape the root or looks like an absolute path.
- `fp` is `{ title, artist, album, durationSec }`.

`buildRefIndex` builds case-insensitive path lookup plus fingerprint buckets from the current library
snapshot. `resolveTrackRef` returns:

- `found` for an exact (case-insensitive) path match;
- `relinked` for a unique fingerprint match (normalized title/artist/album, duration within 1 s),
  together with a healed ref;
- `missing` for zero or ambiguous matches.

Refs are never deleted or rewritten merely because they are missing; healing happens only during a
real favorites write.

## Versioned file layer (`versionedStore.ts`)

The generic store takes an injected `FsAdapter`, current version, and validator. It enforces a 10 MB
size cap, reads `.bak` on corrupt main files, marks a newer version (`newerVersion: true`) and refuses
writes to it, preserves unknown top-level fields, and returns classified failures
(`read-only`, `unavailable`, or `newer-version`). Read-only comes from `EACCES`/`EPERM`/`EROFS`;
`ENOENT`/`ENXIO`/`EIO`/`ENODEV`/`ENOTCONN` and other errors are `unavailable` with a message.

## Store and status (`lyrixDataStore.ts`)

`LyrixDataStore.bind(root)` synchronously rebinds and asynchronously detects the folder without
creating anything. `LyrixDataStatus` is
`{ state: 'unbound' | 'not-created' | 'ready' | 'read-only' | 'unavailable' | 'newer-version',
writable, libraryId, message }`. A symlinked `LyrixData` folder is refused as `read-only`.

- `ensureCreated()` creates the folder, `README.txt`, and `library.json` on the first write only.
- All writes share one serialized promise chain; each operation captures its root/generation, and a
  slow operation from library A is dropped after rebinding to library B.
- `retry()` re-detects and re-attempts the first-write creation, clearing a cached failure.
- Status changes are emitted to `lyrixdata:status-changed`.

`libraryId` is read from `library.json` and stays stable across rebinds. The scanner skips a
root-level `LyrixData` directory entirely; it is never treated as music or lyrics.

## Favorites (`favoritesStore.ts`)

Favorites are keyed in memory by normalized ref path. Mutations are read-modify-write: re-read the
file, apply the change, heal relinked refs, write, then re-resolve and emit. Add/remove are
idempotent, additions cap at 100,000 items, and a mutation with no actual change does not write.
Missing refs are reported separately with their stored title/artist/album/addedAt. The renderer only
sends and receives track ids; main converts ids through the current library snapshot. `removeAllMissing`
removes all currently unresolved rows without exposing paths over IPC.

## IPC

| Channel | Input | Output |
| --- | --- | --- |
| `lyrixdata:get-status` | — | `LyrixDataStatus` |
| `lyrixdata:retry` | — | `LyrixDataStatus` |
| `favorites:get` | — | `FavoritesState` |
| `favorites:set` | `{ trackIds: string[], favorite: boolean }` | `{ ok: true, state } \| { ok: false, reason }` |
| `favorites:remove-missing` | — | same result shape |

`favorites:set` accepts only valid 40-hex track ids, deduplicates, caps the array at 1000, and rejects
anything else as `invalid`. Every handler catches errors and never throws across the boundary.
Events: `lyrixdata:status-changed` and `favorites:changed`.

Opening a folder, rescan, and background refresh all rebind the store and re-resolve favorites in main
before the renderer sees the new snapshot. Folder changes therefore discard the previous library's
favorites view naturally.
