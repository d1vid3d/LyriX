# Main-Side Lyric Sources

**Purpose:** how the main process discovers lyric text from embedded tags and same-directory sidecar
files, and returns the canonical ordered option list to the renderer.

**Owning source paths:** `src/main/lyrics/embedded.ts`, `src/main/lyrics/sidecar.ts`,
`src/main/lyrics/sources.ts`, `src/shared/lyrics/sources.ts`.

**Last verified:** 2026-11-06 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md) (invariants 4, 5, 11),
[persistence.md](../persistence.md), [shared-lyric-core.md](../shared-lyric-core.md),
[renderer/lyrics-controller.md](../renderer/lyrics-controller.md),
[security-and-robustness.md](../security-and-robustness.md).

`LyricsTrack = { id, filePath }`; `LyricSourceProvider = (track) => Promise<LyricSourceOption[]>`.
The renderer only sends a track id; the path always comes from the scanned library.

## Embedded tags (`embedded.ts`)

`readEmbeddedLyrics(filePath)` returns `{ text, tag }` or `null`.

- Calls `parseFile(filePath, { duration: false, skipCovers: true })`.
- Lookup order: `common.lyrics` (string or `{ text }` / `{ syncText }` entries), then native tags
  whose id is `LYRICS` or `UNSYNCEDLYRICS`, case-insensitive.
- `music-metadata` strips timestamps from `common.lyrics[].text` but retains millisecond entries
  in `syncText`; the resolver reconstructs line-timed LRC (`[mm:ss.cc]`) when the text itself has
  no timestamps. This preserves timed and enhanced word lyrics.
- Handles strings, arrays, `{ text }`, `{ value }`, and `{ syncText }` shapes defensively.

## Sidecars (`sidecar.ts`)

`findSidecars(trackFilePath)`.

- Looks only in the track's own directory for `<base>.lrc` (exact) and `<base>.<variant>.lrc`
  (variants). Names are compared case-insensitively after Unicode NFC normalization; `.lrc` is
  case-insensitive too.
- Uses `lstat` and reads only regular files; symlinks and directories are skipped. Files larger
  than 1 MiB are skipped.
- Decodes UTF-8 (BOM stripped) and UTF-16 LE/BE when their BOM is present.
- Per-file read/decode errors are logged and that file is skipped; an unreadable directory yields
  an empty list.

## Provider list and canonical options (`sources.ts`)

`PROVIDERS` is the ordered provider list (`embedded`, `sidecar`). Adding a provider that uses an
existing source kind is one list entry.

- `getLyricSources(track, { savedChoice, savedTranslationChoice, preference })` runs every
  provider in `try/catch`; a failing provider is logged and contributes nothing.
- Always returns the `embedded` slot and the exact sidecar slot with id
  `sidecar:<expectedSidecarName>`, marking missing slots `available: false`. Variant sidecars
  follow, sorted alphabetically. `expectedSidecarName` is a file name such as `Song.lrc`.
- Each option carries `variant`: the text between the base name and `.lrc` exactly as written
  (`"EN"` for `Song.EN.lrc`), or `null` for embedded and the exact sidecar.
- `detail` is the tag name used or the actual sidecar file name; it is never a full path.
- The response echoes `savedChoice` and `savedTranslationChoice` for the renderer.

The pure selection helpers in `src/shared/lyrics/sources.ts` choose the primary source from these
options. `selectLyricSource` prefers a saved choice when it is available and usable, otherwise the
global `sidecar`/`embedded` preference order, with the usable predicate supplied by the caller.
`selectTranslationSource` is the translation-layer counterpart; its full rules are owned by
[shared-lyric-core.md](../shared-lyric-core.md). The renderer controller supplies `isUsable` from
parsed documents and persists the chosen ids; see
[renderer/lyrics-controller.md](../renderer/lyrics-controller.md).

## Persistence of choices

The per-track source and translation choices shown above are stored by `LyricChoiceStore` in
`src/main/lyrics/choices.ts`. Its file shape, validation, and 5000-entry caps are owned by
[persistence.md](../persistence.md).

## Failure rules

Provider failures never cross IPC: `getLyricSources` resolves with the canonical slots even when a
provider throws, and the IPC handler catches every error and returns `null` for invalid ids
([main/lifecycle-and-ipc.md](lifecycle-and-ipc.md)). Sidecar reads never leave the track's directory
and never follow symlinks ([security-and-robustness.md](../security-and-robustness.md)).
