# LyriX

Notice: This project is still in early development and may be unstable. It is not yet packaged for distribution. As it stands it is a proof-of-concept for a local FLAC player with lyrics support. Tech stack, API, architecture and features may change significantly before a stable release.

A minimal desktop player for local FLAC files, built with Electron, electron-vite and plain
TypeScript/HTML/CSS. It reads tags, groups tracks into albums, shows cover art, offers album,
artist and track views with search and sorting, loads embedded or sidecar `.lrc` lyrics, renders an
aligned translation under each line, and remembers the last folder, volume, view, lyric preference
and translation settings between launches.

## Requirements

- Node.js 22.12+ (tag reading uses `music-metadata`, which requires Node 22+)
- npm

## Run

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run typecheck   # type-check main/preload and renderer
npm run build       # bundle into build/
npm start           # preview the production bundle
npm run package     # package the app without creating an installer
npm run make        # build a Windows .exe installer with Electron Forge
npm test            # run the Vitest suite
npm run test:e2e    # required CDP smoke suite (builds first)
npm run test:e2e:full   # broader CDP regression suite
npm run test:e2e:visual # CSS/visual CDP suite
```

## Project structure

| Path | Description |
| --- | --- |
| `package.json` | Scripts, Electron entry point and dependencies. |
| `electron.vite.config.ts` | electron-vite build configuration; bundles `music-metadata` into the main process. |
| `tsconfig.json` | Root project references for editor tooling. |
| `tsconfig.node.json` | TypeScript config for the main process, preload and shared types. |
| `tsconfig.web.json` | TypeScript config for the renderer and preload global declarations. |
| `src/main/index.ts` | App startup, IPC, background refresh and scan coordination. |
| `src/main/library.ts` | Recursive `.flac` scanning, cache reuse, album snapshots and path containment. |
| `src/main/tags.ts` | Reads tags with `music-metadata` and applies filename/unknown fallbacks. |
| `src/main/lyrics/embedded.ts` | Reads embedded `LYRICS`/`UNSYNCEDLYRICS` tags on demand. |
| `src/main/lyrics/sidecar.ts` | Finds and decodes same-directory `.lrc` sidecars. |
| `src/main/lyrics/sources.ts` | Provider list and canonical lyric source options. |
| `src/main/lyrics/choices.ts` | Per-track lyric and translation choices at `userData/lyric-choices.json`. |
| `src/main/albums.ts` | Pure album grouping and sorting (album artist + album, disc/track). |
| `src/main/cache.ts` | Versioned library cache at `userData/library-cache.json`. |
| `src/main/settings.ts` | Settings at `userData/settings.json` (last folder, volume, last view, per-view sort, lyric preference and translation toggle/language). |
| `src/main/covers.ts` | Extracts/resizes cover art and caches full and thumbnail JPEGs in `userData/covers`. |
| `src/main/json-file.ts` | Tolerant JSON reads and atomic writes. |
| `src/main/ids.ts` | Stable SHA-1 ids for file paths and albums. |
| `src/main/media-protocol.ts` | `media://` protocol for tracks and covers, with HTTP range support. |
| `src/main/pathContainment.ts` | Pure strict path-containment and reveal-path guards. |
| `src/main/reveal.ts` | Resolves, canonicalizes and validates a scanned track before revealing it in the OS file manager. |
| `src/main/windowBounds.ts` | Pure window-bounds fallback/clamp/recenter logic. |
| `src/main/windowState.ts` | Debounced atomic `userData/window-state.json` read/write. |
| `src/main/sessionValidation.ts` | Pure session queue/position validation and caps. |
| `src/main/sessionWritePolicy.ts` | Pure session write-throttle decision. |
| `src/main/sessionStore.ts` | Two-file resume session (queue + position) with folder check and flush. |
| `src/main/lyrixdata/` | Portable refs, safe versioned JSON, LyrixData status/writes, favorites storage and IPC validation. |
| `src/main/mediaKeys.ts` | Opt-in globalShortcut media-key fallback. |
| `src/main/range.ts` | Parses `Range` headers for partial-content responses. |
| `src/preload/index.ts` | Exposes the typed `window.library` API via `contextBridge`. |
| `src/preload/index.d.ts` | Global `Window` typing for the preload API. |
| `src/renderer/index.html` | App shell: toolbar with view/sort/search, album grid, artists, tracks, detail views and player controls. |
| `src/renderer/library/query.ts` | Pure library index, view/sort registry, normalized search and filtering (no DOM). |
| `src/renderer/ui/virtualList.ts` | Fixed-row virtual scroller used by the tracks view. |
| `src/renderer/player/engine.ts` | `PlaybackEngine` interface and the single-`HTMLAudioElement` implementation. |
| `src/renderer/player/queue/` | Editable playback queue with contexts, shuffle, repeat, play-next/add/remove/move and history-preserving snapshots (no DOM). |
| `src/renderer/queue/queuePanelModel.ts` | Pure queue-panel rows, sections, counts, duration, context and empty-state model. |
| `src/renderer/queue/dragReorder.ts` | Pure pointer-slot, move-destination, keyboard-bound and auto-scroll helpers. |
| `src/renderer/menus/contextMenuModels.ts` | Pure track/album/artist/queue-row/current-track menu builders and typed payloads. |
| `src/renderer/menus/contextActions.ts` | Menu-action dispatch with injected queue, transport, navigation, toast and reveal dependencies. |
| `src/renderer/menus/toastMessages.ts` | Exact toast strings and title truncation. |
| `src/renderer/shortcuts/` | Declarative shortcut table, pure matching/typing guard/conflict check, Escape layer stack, command map, single keydown controller and overlay model. |
| `src/renderer/session/` | Pure session send timing and the debounced queue/position tracker. |
| `src/renderer/media/` | Pure Media Session metadata/action mapping and the feature-detected wiring. |
| `src/renderer/favorites/` | DOM-free status/favorites controllers and the pure status/disclaimer models. |
| `src/renderer/ui/favoriteButton.ts` | Inline-SVG heart toggle with ARIA state. |
| `src/renderer/ui/dataDisclaimer.ts` | Focus-trapped LyrixData disclaimer with Retry. |
| `src/renderer/src/views/favoritesView.ts` | Favorites header/status/missing-section rendering. |
| `src/renderer/styles/favorites.css` | Heart, row, and Favorites-view styling. |
| `src/renderer/styles/dataDisclaimer.css` | Disclaimer modal styling. |
| `src/renderer/ui/shortcutOverlay.ts` | Generated modal keyboard-shortcuts dialog with focus trap. |
| `src/renderer/styles/shortcutOverlay.css` | Shortcuts overlay styling. |
| `src/renderer/player/transportDecisions.ts` | Pure ended/previous/failure/repeat-mode decisions. |
| `src/renderer/library/artistTracks.ts` | Pure artist playback ordering (album year → title, then disc → track → title). |
| `src/renderer/lyrics/lyricsController.ts` | On-demand lyric source fetch/parse/selection, translation-layer state, stale-response guard and LRU source cache (no DOM). |
| `src/renderer/lyrics/translationState.ts` | Pure translation eligibility, alignment reports and document attachment (no DOM). |
| `src/renderer/lyrics/translationMenuModel.ts` | Pure translation menu section and quick-toggle view model: status, switch, Auto row, badges, hints. |
| `src/renderer/lyrics/translationLabels.ts` | Language-tag detection, `Intl.DisplayNames` labels and sidecar example names. |
| `src/renderer/lyrics/translationText.ts` | Pure per-line translation text lookup. |
| `src/renderer/lyrics/lyricMenuText.ts` | Shared disabled-reason strings for source and translation rows. |
| `src/renderer/lyrics/segmentGroups.ts` | Pure grouping of word-timed segments into nowrap word containers. |
| `src/renderer/lyrics/sourceMenuModel.ts` | Pure lyric-source menu view model, user-facing strings, disabled reasons, badges, translation section and keyboard helper. |
| `src/renderer/ui/lyricView.ts` | Builds lyric DOM once, renders translation children, syncs line/segment classes and progress, centers and seeks. |
| `src/renderer/ui/lyricSourceMenu.ts` | Source chip and popover DOM, keyboard navigation, ARIA and focus handling. |
| `src/renderer/ui/lyricSourceMenuView.ts` | Stateless popover row, badge, preference and translation-section DOM builders. |
| `src/renderer/ui/translationToggle.ts` | Small translation on/off pill with `aria-pressed`, driven by the view model. |
| `src/renderer/ui/contextMenu.ts` | Generic floating menu with ARIA, roving focus, edge positioning and close rules. |
| `src/renderer/ui/menuTrigger.ts` | Right-click and Shift+F10/Menu-key trigger wiring. |
| `src/renderer/ui/queuePanel.ts` | Virtualized queue slide-over DOM, drag reordering, focus and context triggers. |
| `src/renderer/ui/toast.ts` | Single non-blocking status toast with auto-dismiss. |
| `src/renderer/styles/lyrics.css` | Lyric and translation colors, sizes, transitions, progress fill and Now Playing layout. |
| `src/renderer/styles/lyricSourceMenu.css` | Source chip/popover, translation section and quick-toggle styling, with restyle variables at the top. |
| `src/renderer/styles/contextMenu.css` | Context-menu surface, item, separator and focus styling. |
| `src/renderer/styles/queuePanel.css` | Queue slide-over, row grid, drag handle, current/history and insertion-indicator styling. |
| `src/renderer/styles/toast.css` | Bottom-center toast region and pill styling. |
| `src/renderer/src/queuePanelController.ts` | Queue-panel model, queue mutations and playback intents. |
| `src/renderer/src/shellFeatures.ts` | Wires shortcut commands/layers, session tracking and Media Session with injected dependencies. |
| `src/renderer/src/contextMenus.ts` | Builds every context menu from library/queue state. |
| `src/renderer/src/main.ts` | View routing, rendering, search/sort, queue/transport wiring, context-menu/action/toast wiring, shortcut/session/media wiring, scanning UI and UI-state persistence. |
| `src/renderer/src/style.css` | Dark theme and application layout. |
| `src/shared/types.ts` | Types shared by main, preload and renderer (no runtime code). |
| `src/shared/lyrics/types.ts` | Lyric format, document, line, segment, metadata and parse-option types. |
| `src/shared/lyrics/sources.ts` | Lyric source types plus the pure main-source and translation selectors. |
| `src/shared/lyrics/translation.ts` | Pure line alignment and non-mutating translation attachment. |
| `src/shared/lyrics/time.ts` | Timestamp token parsing, fraction handling and format-detection regexes. |
| `src/shared/lyrics/parse.ts` | `parseLyrics` entry point, option defaults and the ordered parser registry. |
| `src/shared/lyrics/parsers/shared.ts` | Header extraction, timed-line finalization, end estimation and offset shifting. |
| `src/shared/lyrics/parsers/plain.ts` | Untimed plain-text parser. |
| `src/shared/lyrics/parsers/lrc.ts` | Line-timed LRC parser with estimated line ends. |
| `src/shared/lyrics/parsers/enhanced-lrc.ts` | Word-timed enhanced LRC parser with `vN:` singer prefixes. |
| `src/shared/lyrics/sync.ts` | Active line/segment lookup and clamped progress helpers. |
| `src/shared/lyrics/index.ts` | Public exports for the pure lyric core. |
| `tests/lyricChoices.test.ts` | Vitest coverage for main/translation choice round-trips, tolerant reads, invalid ids, independent 5000-entry caps and missing-map tolerance. |
| `tests/lyricSourceProviders.test.ts` | Vitest coverage for canonical source assembly, variant extraction and provider failure isolation. |
| `tests/lyricSources.test.ts` | Vitest coverage for saved/auto selection, preference order, usability rules and translation selection. |
| `tests/queue.test.ts` | Vitest coverage for queue start/advance/previous, shuffle/repeat, insertion order, remove/move/jump, snapshots, subscriptions and reconcile. |
| `tests/queuePanelModel.test.ts` | Vitest coverage for queue-panel rows, sections, counts/duration, history collapse, empty state and drag/remove affordances. |
| `tests/dragReorder.test.ts` | Vitest coverage for pointer row gaps, post-removal destinations, keyboard bounds, auto-scroll and insertion offsets. |
| `tests/contextMenuModels.test.ts` | Vitest coverage for exact menu labels, pluralized counts, payloads, separators and disabled queue-row actions. |
| `tests/contextActions.test.ts` | Vitest coverage for play/queue dispatch, empty-queue fallback, navigation misses, reveal failure and queue-row actions. |
| `tests/toastMessages.test.ts` | Vitest coverage for exact toast strings, pluralization and title truncation. |
| `tests/revealPath.test.ts` | Vitest coverage for containment, traversal/sibling rejection and reveal extension guards. |
| `tests/queueSession.test.ts` | Vitest coverage for queue export/import round-trips, shuffled natural order, vanished tracks/current, malformed input and duplicate ids. |
| `tests/windowBounds.test.ts` | Vitest coverage for default fallback, invalid data, min-size clamp, partial overlap, unplugged monitors and the maximized flag. |
| `tests/sessionValidation.test.ts` | Vitest coverage for queue/position validation, caps, ids, origins, current entry and position matching. |
| `tests/sessionWritePolicy.test.ts` | Vitest coverage for queue/position write decisions and throttling. |
| `tests/sessionStore.test.ts` | Vitest coverage for folder mismatch discard, corrupt files, independent queue/position writes and validation. |
| `tests/sessionTiming.test.ts` | Vitest coverage for the 5 s position interval and immediate send reasons. |
| `tests/sessionController.test.ts` | Vitest coverage for no-writeback before start, queue debounce, position throttling, track changes, flush and seek hooks. |
| `tests/shortcutRegistry.test.ts` | Vitest coverage for exact modifiers, mod mapping, when/scopes, conflicts, labels and the typing guard. |
| `tests/layerStack.test.ts` | Vitest coverage for priority ordering, single-layer close, closed layers and ties. |
| `tests/overlayModel.test.ts` | Vitest coverage for overlay grouping and platform-aware chord labels. |
| `tests/mediaSessionModel.test.ts` | Vitest coverage for metadata/artwork and action mapping. |
| `tests/lyrixDataPaths.test.ts` | Vitest coverage for portable paths, containment, fingerprint matching, relinking and ambiguity. |
| `tests/versionedStore.test.ts` | Vitest coverage for versions, `.bak`, unknown fields, newer versions, size cap and atomic writes. |
| `tests/lyrixDataStore.test.ts` | Vitest coverage for first-write creation, statuses, retry, generation guards, serialized writes and symlinks. |
| `tests/favoritesStore.test.ts` | Vitest coverage for RMW, healing, missing refs, re-resolution and idempotence. |
| `tests/favoritesCap.test.ts` | Vitest coverage for the 100,000-item cap. |
| `tests/favoritesIpc.test.ts` | Vitest coverage for `favorites:set` input validation. |
| `tests/favoritesController.test.ts` | Vitest coverage for optimistic updates, rollback, retry, external changes and missing removal. |
| `tests/favoritesQuery.test.ts` | Vitest coverage for the Favorites view registry, Recently added order, sorts and search. |
| `tests/dataDisclaimerModel.test.ts` | Vitest coverage for disclaimer/status-line text and Why reasons. |
| `tests/scannerLyrixData.test.ts` | Vitest coverage that the scanner never treats LyrixData as music. |
| `tests/lyrics.test.ts` | Vitest coverage for both fixtures, inline edge cases and sync helpers. |
| `tests/lyricsController.test.ts` | Vitest coverage for source selection, manual switching, preference changes, translation enable/selection, stable derived-document identity, reload, stale responses, caching and eviction. |
| `tests/segmentGroups.test.ts` | Vitest coverage for word-container grouping and trailing whitespace. |
| `tests/sidecar.test.ts` | Vitest coverage for sidecar matching, size limits, BOM decoding, variant extraction and symlink skipping. |
| `tests/sourceMenuModel.test.ts` | Vitest coverage for source-menu labels, badges, reasons, empty hints, translation status/switch/rows/badges, quick-toggle states and keyboard navigation. |
| `tests/translation.test.ts` | Vitest coverage for time/index/partial/none alignment, blanks, duet timestamps, untimed documents and non-mutating attachment. |
| `tests/translationLabels.test.ts` | Vitest coverage for language-tag detection, display names, invalid-tag fallback and sidecar example names. |
| `tests/translationText.test.ts` | Vitest coverage for per-line translation lookup and blank/missing entries. |

## How the library works

After a folder is selected, the main process walks it for `.flac` files (skipping symlinks) and
reads tags with `music-metadata`, at most eight files at a time. Missing tags fall back to the
filename for the title and `Unknown Artist` / `Unknown Album`; one unreadable file is reported and
does not stop the scan.

Tag data is cached in `userData/library-cache.json`, keyed by absolute path with the file's
`mtimeMs` and size. Files whose timestamp and size are unchanged are not read again, and files that
no longer exist are dropped. The cache has a schema version and is written atomically. On startup
the cached library is shown immediately and a background refresh runs; **Rescan** repeats the scan
on demand. The header shows `Scanning X / Y` while a scan is running.

Tracks are grouped in the main process by album artist (falling back to artist) plus album title,
then ordered by disc and track number. Albums arrive sorted by title and the renderer can re-sort them
per view. The grid loads cover images lazily, and clicking an album opens its track list.

Cover art is extracted from an embedded picture in the album's tracks (the first few are checked).
If none is found, LyriX looks for `cover.jpg`, `folder.jpg` or `front.jpg` in the album's folder. The
image is resized to about 300 px wide and cached as a JPEG in `userData/covers`. The tracks view and
the now-playing bar request `media://cover/<id>?size=small`, a separate ~96 px JPEG generated from the
large cache and reused. Albums without art show a placeholder.

## Browsing, search and sorting

The header switches between **Albums**, **Artists** and **Tracks**; the sort dropdown depends on the
view (albums: title/artist/year, artists: name/track count, tracks: title/artist/album). Sort order is
remembered per view, and the active view and sorts are stored in `userData/settings.json`; the search
text never is.

Search is debounced by 150 ms and matched against precomputed text: track title, artist and album for
tracks; album title, album artist and track titles for albums; artist name and album titles for
artists. Matching ignores case, surrounding whitespace, diacritics and repeated spaces, and every
query word must be present. **Ctrl+F** or **/** focuses the search box; **Escape** clears it. Search
stays applied when switching views or opening and closing details.

Artists are grouped by the exact album-artist string, so a value such as `"A, B"` remains one artist;
each row shows the artist's album and track counts, and opening one lists that artist's albums in the
normal grid. The tracks view is a flat, fixed-height list with a small cover, title, artist, album and
duration; it is virtualized, so only the visible rows plus a small overscan buffer exist in the DOM.
Clicking a track queues exactly the currently visible filtered and sorted list, and the playing row is
highlighted.

## Lyric core

`src/shared/lyrics` is a pure module: it takes lyric text and returns a typed document, with no DOM,
Electron, audio or filesystem APIs. The main process only reads raw text; the renderer imports the
core for parsing.

`parseLyrics(text, options?)` detects three formats with an ordered parser registry: enhanced LRC
(line timestamps plus `<mm:ss.xxx>` word markers), line-level LRC, and plain untimed text. It reads
`[ti:]`, `[ar:]`, `[al:]`, `[by:]` and `[offset:]` headers (keeping every tag in `metadata.raw`),
supports several leading timestamps on one line, optional `vN:` singer labels, and 1+ digit
fractions. Positive offsets move timestamps earlier; `applyOffset: false` keeps file times.

Line-level ends come from the next timestamp, capped at 10 seconds by default; the last line gets
five seconds. Enhanced lines use their final empty word marker as an exact end, otherwise estimate
the same way. Skipped or odd input becomes a human-readable warning instead of an exception.

`sync.ts` provides frame-friendly helpers: `findActiveLineIndex` (binary search that deliberately
stays on the previous line during gaps), `findActiveLineIndexes` (all lines containing a time,
including overlaps), `findActiveSegmentIndex`, and clamped `lineProgress` / `segmentProgress`.

## Lyrics and Now Playing

Lyrics are read only when a track starts, never during scanning and never stored in the library
cache. `src/main/lyrics/` exposes two providers: embedded tags and sidecar `.lrc` files. The embedded
provider reads `common.lyrics` first and then native `LYRICS` / `UNSYNCEDLYRICS` tags
(case-insensitive) with `music-metadata`, skipping covers. The sidecar provider looks in the track's
own folder for `<base>.lrc` and `<base>.<variant>.lrc`, matching names case-insensitively after
Unicode NFC normalization. It reads only regular files, skips symlinks, directories and files over
1 MiB, and decodes UTF-8 (with BOM stripped) and UTF-16 LE/BE (with BOM).

The main process returns an ordered source list: the embedded slot, the exact sidecar slot, then any
variant sidecars alphabetically. Missing slots are marked unavailable, and variant options carry the
suffix as written (`EN` for `Song.EN.lrc`). The global preference (`"sidecar"` by default, or
`"embedded"`) picks the automatic source; a per-track saved choice overrides it. Choices live in
`userData/lyric-choices.json` (version 1, `tracks` plus an optional `translations` map, each capped
at 5000 entries) and the preference plus translation toggle/language live in
`userData/settings.json`. The `lyrics:get-sources` IPC accepts only a track id, resolves the path in
the main process and returns `null` instead of throwing; `lyrics:set-choice`,
`lyrics:set-translation-choice`, `settings:set-lyric-preference` and `settings:set-translation`
validate their input.

The renderer controller fetches the sources on each current-track change, parses every available
option and selects one using the pure `selectLyricSource` rules. It ignores responses for a track
that is no longer current, caches the last 10 whole source entries (including “none”), and can
switch sources without refetching. `reload()` bypasses the cache while keeping the saved choices, so
an edited sidecar is picked up. It contains no DOM code. The translation layer is derived on every
recompute: a second source (never the primary) is chosen by saved choice or sticky language, aligned
against the primary with `alignTranslation`, and attached to `state.doc` only when translation is
enabled. The derived document is memoized by primary-document identity plus translation key, so
unrelated state emissions do not rebuild the lyric DOM. `LyricView` builds the line DOM once per
document, keeps word containers unbreakable, appends a plain `div.lyric-translation` under lines
that have text for the active key, and toggles only changed line/segment classes from
`requestAnimationFrame`, reading the position from the `PlaybackEngine`. The current line is centered
with smooth scrolling; manual wheel/touch/drag pauses centering for four seconds. Clicking a timed
line seeks to its start without changing play/pause. Plain documents are static and not clickable.

Clicking the cover/title in the bottom bar opens Now Playing in the main content area; the player bar
stays visible. The close button or **Escape** restores the previous view without re-rendering it, so
search text and scroll positions survive. The view updates live as tracks change, shows
“Loading lyrics…” / “No lyrics found”, and stacks the cover above the lyrics on narrow windows. All
lyric styling lives in `src/renderer/styles/lyrics.css`; JavaScript only sets classes and the
`--progress` variable.

A source chip sits above the lyrics and opens a popover listing the automatic choice and every
source in canonical order (embedded, exact sidecar, then variant sidecars). The chip shows the active
source, a small **Auto** tag when the choice is automatic, **No lyrics** when nothing is usable, or
**Loading…** while sources load. Rows show the saved-choice radio, the tag/file name, and badges for
format, line count, singer labels and parser warnings; the displayed source gets an **In use** pill.
Unavailable or unreadable rows are disabled with a reason. The **Auto** row shows what is currently
in use, and the preference group switches between **Sidecar** and **Embedded** when both exist.
**Reload sources** re-reads the current track's tags and sidecars. Selecting a source closes the
menu; changing the preference or reloading keeps it open. The menu closes on outside clicks, and
keyboard support covers open, arrow/Home/End navigation, activation, Escape and Tab; an open menu
consumes Escape so it does not also close Now Playing. A rescan or `library:updated` clears the
lyric cache and reloads the current track's sources, so edited tags and sidecars appear without
losing a saved choice. When nothing is found, the empty state keeps “No lyrics found” and adds a
hint naming the expected sidecar file (or a generic version when the name is unavailable).

A **Translation** pill sits next to the source chip and toggles the selected translation under each
lyric line; it uses `aria-pressed`, shows a state-explaining tooltip, and is disabled while lyrics
load, when there are no lyrics, or when translation is off with no eligible option. The source
popover also has a Translation section: a **Show translation** switch (kept open when toggled) and,
while enabled, an **Auto** row plus every eligible translation option. Rows show the same saved-choice
radio, `In use` pill and disabled reasons as source rows, plus a muted language badge
(`Intl.DisplayNames`, raw variant as fallback) and an alignment badge. Alignment reads
`Matched n/total` for timestamp matching, `Paired by line order` for index matching, and
`Partial match n/total` for partial matching; anything short of a full timestamp match gets a warning
tone and a one-sentence tooltip. Translation text is plain line-level text and follows the line's
current/past/upcoming styling through ancestor classes; it is never word-highlighted. Toggling or
switching translation on the same track keeps the current line centered without animation.

## How local playback works

The renderer never touches the filesystem. It receives `media://track/<id>` and
`media://cover/<id>` URLs; the ids are derived from absolute paths or album keys, so the renderer
never sees a real path.

The custom scheme is registered as standard, secure and streaming, so an `<audio>` element can play
it. Requests are served by `protocol.handle` in `src/main/media-protocol.ts`, which:

- resolves the id back to a real file and rejects anything outside the folder the user selected
  (including symlink escapes),
- only serves regular `.flac` files,
- responds with `206 Partial Content` and `Content-Range` for byte ranges, which makes seeking work,
- serves covers only from the generated cover cache.

The bottom bar shows the current track, artist and a small cover. Clicking a track in an album queues
the whole album in disc/track order; clicking one in the tracks view queues the visible list. Album
and artist headers expose **Play** and **Shuffle**. The bar also has **Shuffle** and a **Repeat**
button that cycles off → all → one (with a "1" badge).
Playback advances automatically when a track ends; repeat-one replays the track, repeat-all wraps the
queue, and otherwise playback stops at the end of the last track.
**Previous** restarts the current track when it is more than three seconds in, otherwise it moves back
one track. If a file cannot be played, the player logs it and skips forward until it finds a playable
track (stopping after one failure per queue entry). The last folder, volume, view, per-view sort,
shuffle, repeat, lyric preference and translation toggle/language are stored in `userData/settings.json`
and restored on the next launch.

## Queue panel, context menus and toasts

The **Queue** button in the player bar (or **Q** when no text input has focus) opens a slide-over
showing the queue context and total time, a **Clear** action, the current entry, **Next up**, and a
collapsed **History** section. The list is virtualized, so very long queues stay smooth. Double-click
or press **Enter** on a row to play it; use a row's remove button, **Delete** or **Backspace** to drop
an upcoming entry. Drag a **Next up** row by its handle (or press **Alt+Up/Down**) to reorder it; an
accent line shows where it will land, dragging near an edge scrolls, and **Escape** cancels. The
current entry cannot be removed or moved. **Escape** closes an open menu first, then the queue panel,
then Now Playing, then clears search.

Right-click (or focus a row and press **Shift+F10** / the Menu key) for playback, queue, navigation
and file-manager actions on tracks, album cards, artist rows, queue rows, and the current track.
**Play next** and **Add to queue** on an empty queue start playing the first added track immediately.
**Go to album** / **Go to artist** close Now Playing through the normal navigation path; if the
target is gone, a toast explains it. **Show in file manager** sends only the track id to the main
process, which re-resolves and validates the file against the selected library folder before asking
the OS to reveal it. Toasts appear bottom-center above the player bar, replace the previous message,
auto-dismiss after about 2.5 seconds, and never take focus or block clicks.

## Window, session resume, shortcuts, and media keys

LyriX remembers its normal window size/position and maximized state across launches, recenters the
window if the saved monitor is gone, and allows only one instance at a time (a second launch focuses
the existing window). It also restores the last queue and the paused position of its current entry
when the same music folder is loaded; a session from another folder is discarded. Nothing autoplays
on launch.

Global shortcuts now live in one table: **Space** play/pause, **N/P** or **Ctrl+←/→** previous/next,
**J/L** seek, **Ctrl+↑/↓** volume, **S** shuffle, **R** repeat, **Q** queue, **Ctrl+F** or **/**
search, **Ctrl+L** Now Playing, **T** translation (when available), and **?** for the generated
shortcut help dialog (also reached from the toolbar `?` button). Typing in a text field keeps the
native keys. **Escape** closes exactly one layer at a time: context menu, shortcuts dialog, lyric
source menu, queue panel, Now Playing, then clears search.

Playback metadata is published to the OS through Chromium's Media Session API so the Windows media
overlay and hardware media keys can control playback while LyriX is in the background. The
global-shortcut media-key fallback is implemented but disabled because the Media Session route is the
one LyriX uses.

## Favorites and LyrixData

LyriX keeps its portable data in a `LyrixData` folder **inside the selected music folder**. It is
created only on the first write (for example your first favorite), is safe to back up or delete, and
travels with the library across disks. Deleting it resets favorites (and future history/playlists).
Opening, scanning, and browsing a library never changes it. Settings, the session, window state,
lyrics choices, and the tag cache remain machine-local under the app's data folder.

Favorites are track-level. Hearts appear on Tracks rows, album detail rows, queue rows, the player
bar current track, and the Now Playing header; the context menus and the **F** shortcut toggle the
same state. The **Favorites** library view lists them with Recently added/Title/Artist/Album sorting
and normal search, and its header can Play or Shuffle the visible list. Missing entries stay listed
read-only under a collapsed section so you can inspect and remove them. If the library is read-only,
unavailable, or was written by a newer LyriX version, the Favorites header explains why and the
disclaimer dialog offers Retry; nothing is silently changed.

## Out of scope (for now)

Gapless playback, crossfade, queue-contents export/save as a playlist,
fuzzy search, search history, filters, artist images, splitting multi-artist values, genres, grid/artist
virtualization, online lyric or translation lookup, singer-specific lyric styling, translation
editing, swapping original/translation, side-by-side translation layout, word-level translation
timing, per-language fonts, TTML, tag editing and packaging are intentionally not implemented.

The queue panel intentionally omits undo, multi-select and saving the queue as a playlist; context
menus do not implement submenus; tracks cannot be dragged from the library into the queue; shortcut
overrides are not user-configurable; and the resume session stores only the current entry's position.
LyrixData currently stores favorites only; history, playlists, album-level favorites, multi-library
switching, and any tag/lyric/sidecar editing are not implemented.
