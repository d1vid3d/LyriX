# Extension Guide

**Purpose:** recipes for the changes that are expected to recur. The original file-by-file “where to
make a change” table is intentionally not copied: each module spec lists its owning source paths, and
the index routes by concern. Use `graphify query` for the current file/import map.

**Owning source paths:** the paths named in each recipe.

**Last verified:** 2026-11-06 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](TechnicalSpecs.md), [main/lyric-sources.md](main/lyric-sources.md),
[renderer/library-query-and-lists.md](renderer/library-query-and-lists.md),
[renderer/playback.md](renderer/playback.md), [persistence.md](persistence.md).

## Add a lyric source

1. Implement a `LyricSourceProvider` in `src/main/lyrics/`:

   ```ts
   async function extraFileProvider(track: LyricsTrack): Promise<LyricSourceOption[]> {
     const text = await readExtraFile(track) // return [] when unavailable
     return text
       ? [{
           id: `sidecar:${extraFileName(track.filePath)}`,
           kind: 'sidecar',
           label: 'Extra file',
           detail: extraFileName(track.filePath),
           available: true,
           text,
           variant: null
         }]
       : []
   }
   ```

2. Add it to `PROVIDERS` in `src/main/lyrics/sources.ts` in the desired order.
3. Return `[]` for expected misses; do not throw. Provider failures are logged and skipped.
4. Keep ids file-name-only (`embedded` or `sidecar:<file name>`) and set `variant` to the
   language/region suffix as written (or `null`). A provider that fits those kinds needs no IPC or
   renderer changes: the controller parses every available option and applies the saved-choice /
   preference rules automatically, the source menu lists the new option, and translation selection
   can use it as a second layer.
5. A genuinely new kind (for example online lookup) also requires extending `LyricSourceKind`, the
   auto-selection order in `src/shared/lyrics/sources.ts`, and source-id validation in
   `src/main/lyrics/choices.ts`.

The sidecar provider is the reference implementation: same-directory discovery, regular files only,
size cap, NFC/case-insensitive matching, and UTF-8/UTF-16 BOM decoding.

## Add a library view

1. Extend `LibraryView` and add an entry to `VIEWS` in `src/renderer/library/query.ts` with a label,
   default sort, sort map, and item builder.
2. Add a section to `index.html`, include it in `NavigationController.showSection`/`currentSection`,
   and render it in `src/renderer/src/screen.ts` (plus a `src/renderer/src/views/` renderer).
3. Add a view button with `data-view` and a `LibraryView` value.

## Add a sort option

1. Add a `SortOption` entry to the relevant `VIEWS[view].sorts`.
2. The dropdown, validation, and persistence pick it up automatically.

## Replace the playback backend

Implement `PlaybackEngine` and construct it in `main.ts` instead of `HtmlAudioEngine`. The lyric view
only needs `getPosition` and `seek`; the rest of the UI uses the interface.

## Add a persisted setting

1. Extend `Settings` in `src/shared/types.ts`.
2. Add validation/defaults in `src/main/settings.ts`.
3. Add an IPC handler if the renderer writes it, and expose it in the preload `LibraryApi`.
4. Read it during renderer initialization and save on change.

## Related contracts

- New provider shape and canonical option order: [main/lyric-sources.md](main/lyric-sources.md).
- Choice validation and entry caps: [persistence.md](persistence.md).
- View/sort registry behavior: [renderer/library-query-and-lists.md](renderer/library-query-and-lists.md).
- `PlaybackEngine` interface: [renderer/playback.md](renderer/playback.md).
- Settings defaults and normalization: [persistence.md](persistence.md).
- Preload/IPC surface: [main/lifecycle-and-ipc.md](main/lifecycle-and-ipc.md).
