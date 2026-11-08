# Covers and Media Protocol

**Purpose:** cover-art extraction/caching and the privileged `media://` responses used by the audio
element and cover images.

**Owning source paths:** `src/main/covers.ts`, `src/main/media-protocol.ts`, `src/main/range.ts`.

**Last verified:** 2026-11-08 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md) (invariants 1–3),
[main/library-scanning.md](library-scanning.md), [persistence.md](../persistence.md),
[security-and-robustness.md](../security-and-robustness.md), [renderer/shell-and-navigation.md](../renderer/shell-and-navigation.md).

## Cover art (`src/main/covers.ts`)

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

The cover cache path and atomic-write strategy are owned by [persistence.md](../persistence.md). The
small-cover URL helper on the renderer side is owned by
[renderer/shell-and-navigation.md](../renderer/shell-and-navigation.md).

## Media protocol (`src/main/media-protocol.ts`)

The `media` scheme is registered as **standard, secure, fetch-capable, and streaming** before app
ready.

### `media://track/<id>`

1. Validates the 40-hex id.
2. Resolves the indexed path and the library root.
3. `realpath`s both and rejects anything outside the root (shared `isPathInside` in
   `src/main/pathContainment.ts`).
4. Requires a regular `.flac` file.
5. Supports `HEAD`.
6. Serves `200` with the whole file when there is no `Range`, `206` with `Content-Range` for a valid
   range, `416` for an unsatisfiable range, and `404` for bad ids/paths.
7. Malformed `Range` headers are ignored and the whole file is served.
8. Streams with `createReadStream` and aborts the stream when the request signal aborts.
9. Sends `Content-Type: audio/flac`, `Accept-Ranges: bytes`, `Cache-Control: no-store`.

### `media://cover/<id>?size=small`

1. Validates the album id.
2. Asks `CoverService` for the full or small JPEG.
3. Serves `image/jpeg` with `Cache-Control: no-store`, or `404`.

## Byte ranges (`src/main/range.ts`)

`parseByteRange(header, size)` supports `start-end`, `start-`, and `-suffix`, returning
`{ start, end }`, `'invalid'`, or `'unsatisfiable'`.

The path-containment and id-validation rules are security invariants; their cross-cutting summary is
in [security-and-robustness.md](../security-and-robustness.md). The renderer only ever sees ids and
`media://` URLs, never filesystem paths (invariant 1 in [TechnicalSpecs.md](../TechnicalSpecs.md)).
