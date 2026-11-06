# Shared Lyric Core (`src/shared/lyrics`)

**Purpose:** pure lyric types, parsers, timing math, translation alignment, and sync helpers shared
by main, renderer, and tests.

**Owning source paths:** `src/shared/lyrics/` (`types.ts`, `parse.ts`, `time.ts`, `translation.ts`,
`sync.ts`, `index.ts`, `parsers/shared.ts`, `parsers/plain.ts`, `parsers/lrc.ts`,
`parsers/enhanced-lrc.ts`).

**Last verified:** 2026-11-06 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](TechnicalSpecs.md), [main/lyric-sources.md](main/lyric-sources.md),
[renderer/lyrics-controller.md](renderer/lyrics-controller.md), [renderer/lyric-view.md](renderer/lyric-view.md),
[testing-and-verification.md](testing-and-verification.md).

This module is pure: no DOM, Electron, audio, or filesystem APIs.

## Types

- `LyricFormat = 'plain' | 'lrc' | 'enhanced-lrc'`.
- `LyricSegment { text, start, end, spaceAfter }` — times in seconds; `text` has no trailing
  whitespace.
- `LyricLine { index, start, end, endIsEstimated, text, segments?, agent?, translations? }`.
- `LyricMetadata { title?, artist?, album?, author?, offsetMs?, raw }`.
- `LyricDocument { format, timed, metadata, lines, warnings }`.
- `LyricParseOptions { applyOffset?, maxEstimatedLineSeconds?, lastLineSeconds? }`.
- `ResolvedLyricParseOptions` is the `Required<LyricParseOptions>` form used by parsers.
- `LyricParser` is a registry entry: `{ id, detect(text), parse(text, options) }`.

## Parsing (`parse.ts`)

- Normalizes BOM and CRLF/CR to LF.
- Parser registry order: enhanced LRC → LRC → plain (plain always matches).
- Defaults: `applyOffset: true`, `maxEstimatedLineSeconds: 10`, `lastLineSeconds: 5`.
- `detectLyricFormat(text)` and `parseLyrics(text, options?)` are the public entry points.

## Timestamps (`time.ts`)

- Line timestamps: `[m:ss]` or `[m:ss.fff]` with 1+ fractional digits.
- Inline word timestamps: `<m:ss.fff>`.
- Multiple leading timestamps are supported.
- Fractional digits are treated as a decimal fraction.
- `[offset:]` accepts an optional sign and integer milliseconds.

## Parsers

- **Plain** — trims non-empty body lines, `timed: false`, `start = end = 0`.
- **LRC** — reads every leading timestamp and emits one line per timestamp; text after timestamps is
  the line text.
- **Enhanced LRC** — line timestamps plus inline word markers:
  - Optional `vN:` singer prefix becomes `agent`.
  - Segments are built from text between markers.
  - `spaceAfter` is true when the raw segment had trailing whitespace.
  - A trailing empty marker becomes the line's explicit end.
  - Multiple line timestamps duplicate the line with shifted segment and end times.

## Finalization (`parsers/shared.ts`)

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

## Translation alignment (`translation.ts`)

- `AlignmentMethod = 'time' | 'index' | 'partial' | 'none'`.
- `AlignmentReport { method, matched, total, unmatchedTranslationLines }`; `matched`/`total` count
  non-blank primary lines, and unmatched counts every unconsumed translation line.
- Blank text means empty/whitespace, music notes (`♪ ♫ ♬ ♩`), or punctuation only.
- `alignTranslation(primary, translation, { toleranceSeconds = 0.5, minTimeMatchRatio = 0.8 })`
  returns one `string | null` per primary line plus a report.
  - Time matching is greedy in primary order and one-to-one: the unused translation line with the
    smallest absolute start difference within tolerance wins (ties keep the lowest index). Blank
    primary lines are skipped; duet lines sharing a timestamp consume separate translations.
  - When `matched / total >= minTimeMatchRatio`, method is `"time"`.
  - Otherwise equal line counts (including blanks) pair by index, method `"index"`; this also covers
    untimed documents.
  - Otherwise the time matches are kept as `"partial"` when any exist, else `"none"`.
- `attachTranslation(primary, key, lines)` returns a new document, clones each line, skips null
  entries, and merges `translations[key]` without touching times, segments, or agents.
- `selectTranslationSource(options, { primaryId, savedChoice, language, isUsable })` picks the
  translation layer: an eligible saved choice (`"saved"`), else the first eligible option sorted by
  id whose variant matches the language case-insensitively (`en` matches `en-US`), else a lone
  eligible option (`"auto"`), else null. Eligibility excludes the primary, unavailable, and unusable
  options.

The source-option types (`LyricSourceOption`, `LyricSources`, `LyricPreference`) and the pure
primary-source selection live in `src/shared/lyrics/sources.ts`; their contracts are documented in
[main/lyric-sources.md](main/lyric-sources.md) and consumed by
[renderer/lyrics-controller.md](renderer/lyrics-controller.md).

## Sync helpers (`sync.ts`)

| Function | Behavior |
| --- | --- |
| `findActiveLineIndex(doc, t)` | Binary search for the last line starting at or before `t`; stays on that line through gaps; `-1` when not timed/empty/non-finite. |
| `findActiveLineIndexes(doc, t)` | Every line with `start <= t < end`, including overlaps. |
| `findActiveSegmentIndex(line, t)` | Last segment starting at or before `t`; `-1` when none. |
| `segmentProgress(segment, t)` | Clamped `0..1` progress through a segment. |
| `lineProgress(line, t)` | Clamped `0..1` progress through a line. |

## Consumers

- Main-side embedded/sidecar resolvers return raw text; the renderer parses it with this core. See
  [main/lyric-sources.md](main/lyric-sources.md).
- The renderer controller parses every source option, selects a primary, and derives translation
  state; see [renderer/lyrics-controller.md](renderer/lyrics-controller.md).
- The lyric view consumes `LyricDocument`, the sync helpers, and attached translations; see
  [renderer/lyric-view.md](renderer/lyric-view.md).
- The shared core is the stable part of the lyric pipeline; extending it should not require main or
  renderer changes unless a new format or field is exposed.
