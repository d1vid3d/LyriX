# Testing and Verification

**Purpose:** the Vitest coverage map, fixtures, verification commands, and the pre-merge checklist.
This is the **only** file where volatile verification numbers (test counts, file counts) may appear.

**Owning source paths:** `tests/`, `package.json`.

**Last verified:** 2026-11-06 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](TechnicalSpecs.md), [build-and-config.md](build-and-config.md),
[shared-lyric-core.md](shared-lyric-core.md), [persistence.md](persistence.md).

## Current verification status

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passes (main/preload and renderer projects). |
| `npm test` | 356 tests pass across 20 files. |
| `npm run build` | Passes; emits `out/main`, `out/preload`, `out/renderer`. |
| `npm run dev` | Starts electron-vite and Electron. |

An Electron/CDP end-to-end smoke test (kept outside the repo) also exercises library scanning,
playback, all three lyric formats, missing lyrics, line seeking, live track changes, Now Playing
open/close, search/view/scroll preservation, and console cleanliness.

## Strategy

Tests use **Vitest** and target pure logic plus the DOM-free controller. They run in the Node
environment; nothing mocks Electron or the DOM. The tested modules either have no imports beyond
`node:*` and shared types, or keep their Electron access outside the tested functions.

## Coverage map

| File | Coverage |
| --- | --- |
| `tests/albums.test.ts` | Grouping by album artist + album title; `albumArtist` used verbatim (the artist fallback happens in `tags.ts`); disc/track/title ordering; album title sorting; first non-null year; deterministic 40-hex ids and cover URLs; input array not reordered. |
| `tests/cache.test.ts` | Empty/missing cache; malformed JSON; wrong version; invalid folder and tracks containers; malformed entries dropped individually; nullable track/disc/year fields; save/load round-trip. |
| `tests/ids.test.ts` | Known SHA-1 digests; determinism; 40 lowercase hex characters; different inputs produce different ids. |
| `tests/json-file.test.ts` | Missing and malformed JSON fall back; valid JSON parses; atomic string and binary writes; parent-directory creation; overwrite; no temporary files left behind; pretty-printed JSON. |
| `tests/lyricChoices.test.ts` | Main-choice and translation round-trips; missing `translations` tolerance; tolerant reads (bad JSON, wrong version, malformed containers); invalid id rejection; independent 5000-entry caps and oldest eviction; existing choices surviving. |
| `tests/lyricSourceProviders.test.ts` | Canonical slot assembly; exact-sidecar id vs actual file name; variant ordering and extraction; provider failure isolation; saved-choice/preference/translation echo. |
| `tests/lyricSources.test.ts` | Saved vs auto selection; sidecar/embedded preference order; missing and unusable saved choices; variant fallback; custom usability predicate; nothing usable; translation saved/auto, language matching, single fallback, ambiguity, and primary exclusion. |
| `tests/lyrics.test.ts` | Both fixtures; format detection; metadata; word segments and agents; fractional timestamps; overlapping lines; gap behavior; offsets; warnings; sync helpers and progress clamps. |
| `tests/lyricsController.test.ts` | Auto vs saved selection; embedded/sidecar preference; unusable source skipping; manual switch without refetch; clearing a choice; preference recomputation; reload bypassing the cache; stale-response guard; LRU eviction; cached “none”; reset behavior; translation enable/disable, auto by language, saved choice, sticky language, ineligible saved translation, reload preservation, and stable derived-document identity. |
| `tests/sourceMenuModel.test.ts` | Trigger/auto/saved states; canonical row order; badges (format, line count, singers, warnings); disabled reasons; loading labels; preference options; empty-state hints with and without `expectedSidecarName`; translation status, switch/hint rules, auto row, hidden/disabled rows, language and alignment badges, quick-toggle states; pure keyboard wrap/skip/edge helpers with translation rows. |
| `tests/translationLabels.test.ts` | Language-tag detection; English `Intl.DisplayNames` labels; raw-variant fallback for invalid tags; sidecar example names with/without a sticky language. |
| `tests/translationText.test.ts` | Per-line translation lookup: missing key, missing entry, blank text, matching plain text. |
| `tests/sidecar.test.ts` | Exact/variant matching; case-insensitive names and extension; ignored names and directories; 1 MiB cap; UTF-8/UTF-16 BOM decoding; symlink skip where supported; unreadable directory. |
| `tests/query.test.ts` | `normalizeText`; every-word and order-independent search; substring matching; empty search; all three views and every sort key; unknown-sort fallback; exact album-artist grouping (`"A, B"` separate from `"A"`); album search by track title; view/sort validators and defaults. |
| `tests/queue.test.ts` | Start-index clamping (negative, past end, fractional, non-finite); empty queue; next/previous at both ends; `hasNext`/`hasPrevious`; input-array copy; `getTracks`/`getCurrentIndex`. |
| `tests/range.test.ts` | `start-end`, open-ended, and suffix ranges; end beyond file size; suffix larger than the file; start beyond file size; malformed and multiple ranges; zero-size files; non-safe integers. |
| `tests/routeStack.test.ts` | `topRoute`; non-mutating push/pop; pruning invalid routes from the top only; back-label selection for each view and parent route. |
| `tests/segmentGroups.test.ts` | Syllable grouping; `spaceAfter` boundaries; trailing final group; empty input. |
| `tests/settings.test.ts` | Volume clamping; missing/malformed files; invalid fields; empty sort values dropped; folder, view, lyric-preference, and translation fallbacks; save normalization. Documents that unknown view and sort keys currently pass through main-side normalization and are validated by the renderer. |
| `tests/translation.test.ts` | Time matching within/outside tolerance; equal-count index fallback; partial/none; missing and extra lines; blank and music-note lines; duet timestamps; untimed documents; custom options; non-mutating attachment with merged translations. |

Tests that pin behavior which conflicts with a stated invariant are marked with an inline comment
rather than changing production code.

## Fixtures

- `tests/fixtures/LineByLine.txt` — line-timed LRC.
- `tests/fixtures/TimedWordByWord.txt` — enhanced LRC with singer labels and overlapping lines.

## Commands

Run the unit/integration suite with:

```bash
npm test
```

Type-check both projects with:

```bash
npm run typecheck
```

The end-to-end smoke tests live outside the repository (temporary Electron/CDP scripts) and verify
the built app against generated FLAC fixtures. They are not part of `npm test`.

## Verification checklist

Before merging a change:

```bash
npm run typecheck
npm test
npm run build
npm run dev        # manual smoke: open a folder, play tracks, open Now Playing
```

Expected:

- Type-check passes for both projects.
- All Vitest files pass (current count in the verification-status table above).
- Production bundles build into `out/`.
- `npm run dev` opens the app with no console errors.
- Lyrics still load for line, word, and plain fixtures; missing lyrics shows the empty state.
- Now Playing open/close preserves search, view, and scroll.
