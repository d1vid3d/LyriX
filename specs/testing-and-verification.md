# Testing and Verification

**Purpose:** the Vitest coverage map, fixtures, verification commands, and the pre-merge checklist.
This is the **only** file where volatile verification numbers (test counts, file counts) may appear.

**Owning source paths:** `tests/`, `package.json`.

**Last verified:** 2026-11-10 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](TechnicalSpecs.md), [build-and-config.md](build-and-config.md),
[shared-lyric-core.md](shared-lyric-core.md), [persistence.md](persistence.md).

## Current verification status

| Command | Result |
| --- | --- |
| `npm run lint` | Passes (ESLint flat config, including type-aware TypeScript rules). |
| `npm run typecheck` | Passes (main/preload and renderer projects). |
| `npm test` | 602 tests pass across 49 files. |
| `npm run build` | Passes; emits `build/main`, `build/preload`, `build/renderer`. |
| `npm run test:e2e` | Passes; 113 checks (Tier 1 smoke). |
| `npm run test:e2e:full` | Passes; 158 checks (Tier 2 regression). |
| `npm run test:e2e:visual` | Passes; 29 checks (Tier 3 visual). |
| `npm run dev` | Starts electron-vite and Electron. |

## Strategy

Tests use **Vitest** and target pure logic plus the DOM-free controller. They run in the Node
environment; nothing mocks Electron or the DOM. The tested modules either have no imports beyond
`node:*` and shared types, or keep their Electron access outside the tested functions.

A separate in-repo CDP suite (`tests/e2e/`) drives the built Electron app. It complements Vitest:
unit tests pin pure logic, while the E2E tiers verify the real main/preload/renderer wiring,
filesystem scanning, audio playback, and DOM behavior. The E2E tiers are not part of `npm test`.

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
| `tests/queue.test.ts` | Editable queue: start clamping, empty queue, advance/peek with repeat-one/all, shuffle on/off with injectable RNG, play-next/add ordering, remove/move/jump, clear/clear-upcoming, snapshot freezing/memoization/version, subscriptions, reconcile, and origins. |
| `tests/queuePanelModel.test.ts` | Queue-panel rows and sections, collapsed/expanded history, current/upcoming/history classification, counts/duration/context labels, empty text, singular/plural labels, album-lookup fallbacks, and drag/remove affordances. |
| `tests/dragReorder.test.ts` | Pointer row-gap rounding with scroll offset, upcoming-slot conversion, post-removal move destinations, drop-hole slots, per-row shift direction, keyboard move bounds, edge auto-scroll direction, and insertion-indicator offsets. |
| `tests/contextMenuModels.test.ts` | Exact track/album/artist/queue-row/current-track labels, pluralized queue counts, separators, payloads, play closures, album first-track reveal payload/disabled state, and current-row disabled actions. |
| `tests/contextActions.test.ts` | Play vs queue dispatch, empty-queue play-next/add fallback, album/artist play/shuffle, album/track go-to-artist navigation, album reveal via the first track, missing navigation targets, reveal failure toast, queue-row jump/move/remove, and disabled-item no-ops. |
| `tests/toastMessages.test.ts` | Exact toast strings, single/multiple track messages, empty input, and title truncation. |
| `tests/revealPath.test.ts` | Strict path containment, sibling-prefix/traversal rejection, FLAC-extension requirement, and null root/file guards. |
| `tests/queueSession.test.ts` | Queue export/import round-trips, shuffled natural-order restore, vanished tracks/current, empty/malformed input, duplicate ids, and no reshuffle. |
| `tests/windowBounds.test.ts` | Default fallback, invalid saves, min-size clamp, sufficient/insufficient overlap, unplugged monitor recentering, and maximized pass-through. |
| `tests/sessionValidation.test.ts` | Queue/position validation, entry caps, id/label bounds, origins, current-entry membership, and position/entry matching. |
| `tests/sessionWritePolicy.test.ts` | First write, unchanged no-op, queue changes, position throttling, and immediate track-change writes. |
| `tests/sessionStore.test.ts` | Folder-mismatch discard, corrupt/wrong-version reads, independent queue/position payloads, invalid updates, and flush. |
| `tests/sessionTiming.test.ts` | Time-update interval and immediate pause/seek/track-change/flush reasons. |
| `tests/sessionController.test.ts` | No writeback before start, queue debounce, position throttling, track-change zero, flush, and the seek hook. |
| `tests/shortcutRegistry.test.ts` | Exact modifier matching, mod mapping, when/scopes, conflict detection, labels, and the typing/native-activation guard. |
| `tests/layerStack.test.ts` | Priority ordering, exactly-one close, closed-layer skipping, ties, and unregister. |
| `tests/overlayModel.test.ts` | Category grouping and platform-aware chord labels. |
| `tests/mediaSessionModel.test.ts` | Metadata/artwork URLs and Media Session action mapping including default seeks. |
| `tests/lyrixDataPaths.test.ts` | Portable path normalization, containment, exact/fingerprint resolution, relinking, duration tolerance, ambiguity and duplicates. |
| `tests/versionedStore.test.ts` | Versioned round trips, `.bak`, unknown-field preservation, newer versions, size cap, cleanup and write classification. |
| `tests/lyrixDataStore.test.ts` | No-create bind/read, first-write files, stable library id, error classes, retry, generation guard, ordering and symlink refusal. |
| `tests/favoritesStore.test.ts` | Idempotent add/remove, concurrent mutation ordering, external RMW, healing only on write, re-resolution, missing reporting and removal. |
| `tests/favoritesCap.test.ts` | 100,000-item cap without a write. |
| `tests/favoritesIpc.test.ts` | `favorites:set` shape/id/cap validation. |
| `tests/favoritesController.test.ts` | Optimistic add/remove, rollback, retry closure, external events, missing removal and toast strings. |
| `tests/favoritesQuery.test.ts` | Favorites view registry, Recently added default, sorts and search. |
| `tests/dataDisclaimerModel.test.ts` | Disclaimer messages/features and status-line Why variants. |
| `tests/scannerLyrixData.test.ts` | Root-level LyrixData is never scanned as music. |
| `tests/transportDecisions.test.ts` | Ended (stop/play/restart), previous (>3 s restart), failure cap, and repeat-mode cycling. |
| `tests/artistTracks.test.ts` | Artist playback order: album year then title (unknown last), disc then track then title, missing disc as one, input not reordered. |
| `tests/range.test.ts` | `start-end`, open-ended, and suffix ranges; end beyond file size; suffix larger than the file; start beyond file size; malformed and multiple ranges; zero-size files; non-safe integers. |
| `tests/routeStack.test.ts` | `topRoute`; non-mutating push/pop; pruning invalid routes from the top only; back-label selection for each view and parent route. |
| `tests/segmentGroups.test.ts` | Syllable grouping; `spaceAfter` boundaries; trailing final group; empty input. |
| `tests/settings.test.ts` | Volume clamping; missing/malformed files; invalid fields; empty sort values dropped; folder, view, lyric-preference, translation, shuffle, and repeat fallbacks; save normalization. Documents that unknown view and sort keys currently pass through main-side normalization and are validated by the renderer. |
| `tests/translation.test.ts` | Time matching within/outside tolerance; equal-count index fallback; partial/none; missing and extra lines; blank and music-note lines; duet timestamps; untimed documents; custom options; non-mutating attachment with merged translations. |

Tests that pin behavior which conflicts with a stated invariant are marked with an inline comment
rather than changing production code.

## Fixtures

Unit fixtures:

- `tests/fixtures/LineByLine.txt` — line-timed LRC.
- `tests/fixtures/TimedWordByWord.txt` — enhanced LRC with singer labels and overlapping lines.

E2E fixtures (committed and canonical):

- `tests/e2e/fixtures/lyrics/` — one album with 20 FLAC tracks: line-timed (`01 - Lyric Test`),
  word-timed (`02 - Word Test`), untimed plain text (`03 - Plain Test`), missing lyrics
  (`04 - No Lyrics`), 16 filler tracks, and an album `cover.jpg`.
- `tests/e2e/fixtures/library/` — 5 albums across 7 `.flac` files: a shared album by two album
  artists, an embedded cover, a folder `cover.jpg`, an album without art, an untagged track, and
  one intentionally corrupt file.

`npm run fixtures:e2e` regenerates both trees with ffmpeg. ffmpeg is needed only for regeneration;
the suites read the committed files. The full suite creates 600 temporary copies at runtime for the
virtualization/rescan checks and does not commit them.

## End-to-end suites

Three tiers drive the built app through raw Chrome DevTools Protocol (CDP). They use Node's built-in
`WebSocket` and `fetch`, so they add no runtime dependency. None of them are part of `npm test`.

| Tier | Command | Scope | When to run |
| --- | --- | --- | --- |
| 1 — smoke | `npm run test:e2e` | Scan, album open, playback, shuffle/repeat controls, queue panel/drag/context menus + Escape priority, album-card menu Go to artist, favorites not-created/ready states, first-write LyrixData files, Favorites view/empty state, heart removal, F shortcut, queue hearts, shortcuts overlay + Escape layering, Media Session metadata/state, line/word/plain lyrics, missing lyrics, line seek, live track changes, Now Playing open/close, search/view/scroll preservation, console cleanliness. | Required on every change. |
| 2 — full | `npm run test:e2e:full` | Startup and cached settings, library metadata, transport wiring, volume persistence, rescan, relaunch, views/search/sort, virtualization with 600 tracks, renderer health. | Opt-in for risky refactors and broad regression coverage. |
| 3 — visual | `npm run test:e2e:visual` | Word-flash highlighting plus player-bar button colors, sizes, icons, shuffle/repeat active states, and active/upcoming lyric states. | Optional after CSS/UI changes. |

Each script runs `npm run build` first. The harness layout is:

- `tests/e2e/main.cjs` — test-only entry point. It sets Electron's `userData` to a throw-away
  directory before loading the main entry from `package.json`, so production behavior and the
  developer's real profile are untouched.
- `tests/e2e/lib/` — CDP client, app launch/stop, DOM actions and state snapshots, and the shared
  PASS/FAIL runner with failure artifacts.
- `tests/e2e/smoke.mjs` — Tier 1.
- `tests/e2e/full/index.mjs` — Tier 2 orchestrator; `library.mjs`, `playback.mjs`, and `views.mjs`
  hold the domain checks.
- `tests/e2e/full/visual.mjs` — Tier 3.
- `tests/e2e/fixtures/generate.mjs` — fixture regeneration.

The harness launches Electron with `--remote-debugging-port=0`, reads the port from
`DevToolsActivePort` in the isolated `userData` directory, and seeds `settings.json` with
`lastFolder` so no native folder dialog is needed. Fixtures are copied into the OS temp directory
and never scanned in place. Prerequisites are Node 22+ and a graphical desktop session; fixture
regeneration additionally needs ffmpeg on `PATH`.

On failure, the suites keep the temp root and print its path. `<tempRoot>/artifacts/` contains
`failure.png`, `renderer-console.log`, `app.log`, `state.json`, and `failures.json` when available.
Set `LYRIX_E2E_KEEP=1` to keep artifacts after a passing run too.

## Commands

Run the unit/integration suite with:

```bash
npm test
```

Lint the repository with:

```bash
npm run lint
```

Type-check both projects with:

```bash
npm run typecheck
```

Run the end-to-end tiers with:

```bash
npm run test:e2e          # Tier 1, required
npm run test:e2e:full     # Tier 2, opt-in
npm run test:e2e:visual   # Tier 3, optional
```

Regenerate the committed E2E fixtures (requires ffmpeg) with:

```bash
npm run fixtures:e2e
```

## Verification checklist

Before merging a change:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
# risky refactors:
npm run test:e2e:full
# CSS/UI changes:
npm run test:e2e:visual
npm run dev        # manual smoke: open a folder, play tracks, open Now Playing
```

Expected:

- ESLint passes with no errors or warnings.
- Type-check passes for both projects.
- All Vitest files pass (current count in the verification-status table above).
- Production bundles build into `build/`.
- The required Tier 1 smoke suite passes (current count in the verification-status table above).
- `npm run test:e2e:full` passes when run for a risky change; `npm run test:e2e:visual` passes when
  run for a styling change.
- `npm run dev` opens the app with no console errors.
- Lyrics still load for line, word, and plain fixtures; missing lyrics shows the empty state.
- `npm run test:e2e:full` includes a real process restart: the queue/context/current track and paused
  position are restored and never autoplay.
- Media keys and the Windows media overlay cannot be driven by the CDP suites. Check by hand with dev
  or a packaged build: play a track, then use the keyboard media keys and the Windows media flyout
  while LyriX is unfocused. If either does not respond, flip `MEDIA_KEY_MODE` in
  `src/shared/mediaKeys.ts` to `global-shortcuts` and repeat (only one route is active at a time).
- Window state resumes bounds/maximized state between launches; a second launch focuses the existing
  window instead of starting another process.
- Favorites: opening/scanning/browsing a library creates nothing; the first heart creates
  `LyrixData` with README/library/favorites; favorites survive a relaunch; missing refs appear under
  the Favorites view after moving a file; a read-only/unavailable library shows the disclaimer.
- Shuffle and repeat toggle their labels/active states and survive a relaunch.
- The Queue button and `Q` toggle the panel; opening a context menu then pressing Escape closes the
  menu before the queue panel.
- Now Playing open/close preserves search, view, and scroll.
