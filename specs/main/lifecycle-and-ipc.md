# Main Lifecycle, Window, Store, IPC, and Preload

**Purpose:** app boot order, the single window, shared main-process state, the IPC contract, and the
typed preload bridge.

**Owning source paths:** `src/main/index.ts`, `src/main/window.ts`, `src/main/store.ts`,
`src/main/ipc.ts`, `src/main/reveal.ts`, `src/main/pathContainment.ts`, `src/preload/index.ts`,
`src/preload/index.d.ts`.

**Last verified:** 2026-11-08 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md) (invariants 2, 5, 8),
[persistence.md](../persistence.md), [data-model.md](../data-model.md),
[flows.md](../flows.md), [security-and-robustness.md](../security-and-robustness.md).

## App lifecycle (`src/main/index.ts`)

Startup wiring only:

1. `registerMediaScheme()` runs before `app.whenReady()` (required by Electron).
2. `app.requestSingleInstanceLock()` runs before ready; a second process quits, while the primary
   focuses/restores the existing window on `second-instance`.
3. In media-session mode, the Chromium media-key features are enabled before ready.
4. On ready: set the app user model id, resolve `userData` settings/cache/lyric-choice/session/window
   files, and load settings and cache into the shared `AppStore`. Dev launches use
   `<project>/.lyrix-dev` as `userData` so they never collide with an installed build's single-instance
   lock or data; E2E sets its own temp `userData`.
5. `realpath` the last folder when possible, then `restoreLibrary(root, cache)` to show cached data
   immediately without reading audio files.
6. Load `userData/window-state.json`, load the session against the current library root, create the
   `CoverService` and install the `media://` handler.
7. Load the machine id, bind the `LyrixData` store to the library root, and resolve favorites and
   play history against the restored snapshot without creating anything on disk.
8. Create the `ScanCoordinator` (with the library-applied LyrixData/favorites/history rebind hook),
   register IPC, create the window with restored bounds, and handle macOS re-activation.
9. On quit, flush the session and queued LyrixData writes; on non-macOS, quit when all windows close.

The scan generation counter, IPC handlers, and window creation are described below and in
[main/library-scanning.md](library-scanning.md). Window bounds, the single-instance lock, the session
files/flow, and the media-key route are owned by
[main/window-and-session.md](window-and-session.md).

UNVERIFIED/POSSIBLY STALE: the current startup also constructs and `load()`s the
`LyricChoiceStore` before restoring the library; the original §7.1 step list did not include that
step.

## Window (`src/main/window.ts`)

`WindowManager` owns the single `BrowserWindow`:

- `createWindow(saved)` resolves bounds through `windowBounds.ts`, restores/maximizes before showing,
  builds it with the existing security settings (`contextIsolation`, no Node integration, sandbox),
  shows it on `ready-to-show`, and clears the reference on `closed`.
- Resize/move/maximize changes are saved to `window-state.json` with a 500 ms debounce, and on close.
- `focusOrCreate()` focuses the existing window (restoring if minimized) for a second launch.
- `getWindow()` exposes the current window for dialogs.
- `send(channel, payload)` no-ops when the window or its web contents are destroyed.

The security flags and CSP are summarized in [security-and-robustness.md](../security-and-robustness.md)
and their build-time view in [build-and-config.md](../build-and-config.md). Window-state details are
in [window-and-session.md](window-and-session.md).

## Shared state (`src/main/store.ts`)

`AppStore` holds `settings`, `cache`, `settingsFile`, `cacheFile`, and `lyricChoicesFile`. The startup
code fills it and the scan coordinator / IPC handlers mutate it. Keeping it in one object preserves
the previous module-level state without spreading it across modules.

`Settings` and `LibraryCache` shapes are owned by [data-model.md](../data-model.md); their
normalization and file formats by [persistence.md](../persistence.md).

## IPC handlers (`src/main/ipc.ts`)

`registerIpc(store, scan, choices, session, lyrixData, favorites)` registers the existing channels.
`library:get-state` starts the
one-time startup refresh only when a last folder exists, after the renderer has had a chance to
subscribe.

| Channel | Input | Output |
| --- | --- | --- |
| `library:get-state` | — | `LibrarySnapshot` |
| `library:open-folder` | — | `LibrarySnapshot \| null` (null on cancel/empty) |
| `library:rescan` | — | `LibrarySnapshot \| null` (null when no root) |
| `library:reveal-track` | `trackId: unknown` | `boolean` (false on any invalid/missing/failed path) |
| `session:get` | — | `RestoredSession \| null` (null on folder mismatch/corrupt data) |
| `session:save-queue` | `SessionQueueState` candidate | `void` (validated, capped, folder-stamped) |
| `session:save-position` | `SessionPositionState` candidate | `void` (validated, throttled write) |
| `lyrixdata:get-status` | — | `LyrixDataStatus` |
| `lyrixdata:retry` | — | `LyrixDataStatus` |
| `favorites:get` | — | `FavoritesState` |
| `favorites:set` | `{ trackIds: string[], favorite: boolean }` | `{ ok: true, state } \| { ok: false, reason }` |
| `favorites:remove-missing` | — | same result shape |
| `history:get` | `{ limit?: unknown }` | `HistoryState` (limit clamped) |
| `history:record` | `trackId: unknown` | `{ ok: boolean }` |
| `history:set-recording` | `enabled: unknown` | `{ ok: true, state } \| { ok: false, reason }` |
| `history:clear` | — | same result shape |
| `lyrics:get-sources` | `trackId: unknown` | `LyricSources \| null` |
| `lyrics:set-choice` | `trackId: unknown`, `sourceId: string \| null` | `void` |
| `lyrics:set-translation-choice` | `trackId: unknown`, `sourceId: string \| null` | `void` |
| `settings:get` | — | `Settings` |
| `settings:set-volume` | `volume: unknown` | `void` (clamped) |
| `settings:set-ui` | `UiState` candidate | `void` (normalized) |
| `settings:set-playback` | `{ shuffle: unknown, repeat: unknown }` | `void` (normalized) |
| `settings:set-lyric-preference` | `preference: unknown` | `void` (validated) |
| `settings:set-translation` | `{ enabled: unknown, language: unknown }` | `void` (validated) |

Events to renderer: `library:scan-progress` (throttled), `library:updated` (after a successful
background refresh), `media:key` (only in the global-shortcut fallback mode),
`lyrixdata:status-changed`, `favorites:changed`, and `history:changed` (debounced in the history
store).

`lyrics:get-sources` rejects non-string/empty ids with `null`, resolves the path through
`resolveTrackFile(trackId)`, and catches every error. `lyrics:set-choice` and
`lyrics:set-translation-choice` validate the track id and source id; `null` clears the saved choice,
and invalid input is a no-op. Preference writes accept only `"sidecar"` or `"embedded"`.
`settings:set-translation` requires a boolean `enabled` and a `language` that is `null` or matches
the language pattern; invalid input is a no-op. `settings:set-playback` requires a plain object and
normalizes `shuffle` (only `true` enables it) and `repeat` (`"all"`/`"one"`, otherwise `"off"`).
Write failures are logged and never thrown across the boundary.

`library:reveal-track` accepts only a valid track id, resolves the path from the scanned library,
canonicalizes both the file and the library root, requires a `.flac` regular file strictly inside the
root, and only then calls `shell.showItemInFolder`. Every failure is caught and resolves to `false`.
The validation and security rationale are owned by
[security-and-robustness.md](../security-and-robustness.md); the renderer side by
[renderer/context-menu-and-toasts.md](../renderer/context-menu-and-toasts.md).

The validators for ids and language patterns live in [data-model.md](../data-model.md) and
[persistence.md](../persistence.md). Provider behavior behind `lyrics:get-sources` is owned by
[main/lyric-sources.md](lyric-sources.md).

## Preload bridge (`src/preload/index.ts`)

The preload exposes exactly one global, `window.library`, typed by `LibraryApi`:

| Method | IPC channel | Notes |
| --- | --- | --- |
| `getState()` | `library:get-state` | Returns the current snapshot. |
| `openFolder()` | `library:open-folder` | `null` when the dialog is cancelled. |
| `rescan()` | `library:rescan` | `null` when no folder is open. |
| `revealTrack(trackId)` | `library:reveal-track` | Resolves `true` only when main revealed a validated file. |
| `getSession()` | `session:get` | Returns the validated session for the current folder, or `null`. |
| `saveSessionQueue(state)` | `session:save-queue` | Main validates/caps the payload and folder-stamps it. |
| `saveSessionPosition(state)` | `session:save-position` | Main validates the entry/track/position and throttles writes. |
| `getLyrixDataStatus()` | `lyrixdata:get-status` | Current status without creating anything. |
| `retryLyrixData()` | `lyrixdata:retry` | Re-detects and retries first-write creation. |
| `getFavorites()` | `favorites:get` | Id-based favorites plus main-derived missing metadata. |
| `setFavorite(trackIds, favorite)` | `favorites:set` | Validates ids and returns the full new state or a failure reason. |
| `removeMissingFavorites()` | `favorites:remove-missing` | Removes all unresolved entries without sending paths. |
| `getHistory({ limit? })` | `history:get` | Aggregated resolved history with recording state. |
| `recordPlay(trackId)` | `history:record` | Main stamps the time and appends only when opted in. |
| `setHistoryRecording(enabled)` | `history:set-recording` | The only history call that may create LyrixData. |
| `clearHistory()` | `history:clear` | Atomically empties history.jsonl. |
| `getSettings()` | `settings:get` | Returns normalized settings. |
| `saveVolume(volume)` | `settings:set-volume` | Main clamps the value. |
| `saveUiState(state)` | `settings:set-ui` | Main normalizes the value. |
| `savePlaybackSettings({ shuffle, repeat })` | `settings:set-playback` | Main normalizes both fields and writes atomically. |
| `getLyricSources(trackId)` | `lyrics:get-sources` | Returns ordered source options and selection context, or `null`. |
| `saveLyricChoice(trackId, sourceId)` | `lyrics:set-choice` | `null` clears the per-track choice. |
| `saveLyricPreference(preference)` | `settings:set-lyric-preference` | Main accepts only `"sidecar"` / `"embedded"`. |
| `saveTranslationChoice(trackId, sourceId)` | `lyrics:set-translation-choice` | `null` clears the per-track translation choice. |
| `saveTranslationSettings({ enabled, language })` | `settings:set-translation` | Main validates both fields and writes atomically. |
| `onScanProgress(listener)` | `library:scan-progress` | Returns an unsubscribe function. |
| `onLibraryUpdated(listener)` | `library:updated` | Returns an unsubscribe function. |
| `onMediaKey(listener)` | `media:key` | Fallback mode only; returns an unsubscribe function. |
| `onLyrixDataStatus(listener)` | `lyrixdata:status-changed` | Returns an unsubscribe function. |
| `onFavoritesChanged(listener)` | `favorites:changed` | Returns an unsubscribe function. |
| `onHistoryChanged(listener)` | `history:changed` | Returns an unsubscribe function. |

`subscribe()` wraps the IPC listener so the renderer callback never receives the Electron event
object, and returns a function that removes exactly that listener.

`src/preload/index.d.ts` declares `Window.library: LibraryApi` for the renderer project.
