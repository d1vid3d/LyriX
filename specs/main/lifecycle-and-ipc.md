# Main Lifecycle, Window, Store, IPC, and Preload

**Purpose:** app boot order, the single window, shared main-process state, the IPC contract, and the
typed preload bridge.

**Owning source paths:** `src/main/index.ts`, `src/main/window.ts`, `src/main/store.ts`,
`src/main/ipc.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`.

**Last verified:** 2026-11-06 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md) (invariants 2, 5, 8),
[persistence.md](../persistence.md), [data-model.md](../data-model.md),
[flows.md](../flows.md), [security-and-robustness.md](../security-and-robustness.md).

## App lifecycle (`src/main/index.ts`)

Startup wiring only:

1. `registerMediaScheme()` runs before `app.whenReady()` (required by Electron).
2. On ready: set the app user model id, resolve `userData/settings.json` and
   `userData/library-cache.json`, and load settings/cache into the shared `AppStore`.
3. `realpath` the last folder when possible, then `restoreLibrary(root, cache)` to show cached data
   immediately without reading audio files.
4. Create `CoverService(userData/covers)` and install the `media://` handler.
5. Create the `ScanCoordinator`, register IPC, create the window, and handle macOS re-activation.
6. On non-macOS, quit when all windows close.

The scan generation counter, IPC handlers, and window creation are described below and in
[main/library-scanning.md](library-scanning.md).

UNVERIFIED/POSSIBLY STALE: the current startup also constructs and `load()`s the
`LyricChoiceStore` before restoring the library; the original §7.1 step list did not include that
step.

## Window (`src/main/window.ts`)

`WindowManager` owns the single `BrowserWindow`:

- `createWindow()` builds it with the existing security settings (`contextIsolation`, no Node
  integration, sandbox), shows it on `ready-to-show`, clears the reference on `closed`, and loads
  either `ELECTRON_RENDERER_URL` or the built `index.html`.
- `getWindow()` exposes the current window for dialogs.
- `send(channel, payload)` no-ops when the window or its web contents are destroyed.

The security flags and CSP are summarized in [security-and-robustness.md](../security-and-robustness.md)
and their build-time view in [build-and-config.md](../build-and-config.md).

## Shared state (`src/main/store.ts`)

`AppStore` holds `settings`, `cache`, `settingsFile`, `cacheFile`, and `lyricChoicesFile`. The startup
code fills it and the scan coordinator / IPC handlers mutate it. Keeping it in one object preserves
the previous module-level state without spreading it across modules.

`Settings` and `LibraryCache` shapes are owned by [data-model.md](../data-model.md); their
normalization and file formats by [persistence.md](../persistence.md).

## IPC handlers (`src/main/ipc.ts`)

`registerIpc(store, scan, choices)` registers the existing channels. `library:get-state` starts the
one-time startup refresh only when a last folder exists, after the renderer has had a chance to
subscribe.

| Channel | Input | Output |
| --- | --- | --- |
| `library:get-state` | — | `LibrarySnapshot` |
| `library:open-folder` | — | `LibrarySnapshot \| null` (null on cancel/empty) |
| `library:rescan` | — | `LibrarySnapshot \| null` (null when no root) |
| `lyrics:get-sources` | `trackId: unknown` | `LyricSources \| null` |
| `lyrics:set-choice` | `trackId: unknown`, `sourceId: string \| null` | `void` |
| `lyrics:set-translation-choice` | `trackId: unknown`, `sourceId: string \| null` | `void` |
| `settings:get` | — | `Settings` |
| `settings:set-volume` | `volume: unknown` | `void` (clamped) |
| `settings:set-ui` | `UiState` candidate | `void` (normalized) |
| `settings:set-lyric-preference` | `preference: unknown` | `void` (validated) |
| `settings:set-translation` | `{ enabled: unknown, language: unknown }` | `void` (validated) |

Events to renderer: `library:scan-progress` (throttled) and `library:updated` (after a successful
background refresh).

`lyrics:get-sources` rejects non-string/empty ids with `null`, resolves the path through
`resolveTrackFile(trackId)`, and catches every error. `lyrics:set-choice` and
`lyrics:set-translation-choice` validate the track id and source id; `null` clears the saved choice,
and invalid input is a no-op. Preference writes accept only `"sidecar"` or `"embedded"`.
`settings:set-translation` requires a boolean `enabled` and a `language` that is `null` or matches
the language pattern; invalid input is a no-op. Write failures are logged and never thrown across the
boundary.

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
| `getSettings()` | `settings:get` | Returns normalized settings. |
| `saveVolume(volume)` | `settings:set-volume` | Main clamps the value. |
| `saveUiState(state)` | `settings:set-ui` | Main normalizes the value. |
| `getLyricSources(trackId)` | `lyrics:get-sources` | Returns ordered source options and selection context, or `null`. |
| `saveLyricChoice(trackId, sourceId)` | `lyrics:set-choice` | `null` clears the per-track choice. |
| `saveLyricPreference(preference)` | `settings:set-lyric-preference` | Main accepts only `"sidecar"` / `"embedded"`. |
| `saveTranslationChoice(trackId, sourceId)` | `lyrics:set-translation-choice` | `null` clears the per-track translation choice. |
| `saveTranslationSettings({ enabled, language })` | `settings:set-translation` | Main validates both fields and writes atomically. |
| `onScanProgress(listener)` | `library:scan-progress` | Returns an unsubscribe function. |
| `onLibraryUpdated(listener)` | `library:updated` | Returns an unsubscribe function. |

`subscribe()` wraps the IPC listener so the renderer callback never receives the Electron event
object, and returns a function that removes exactly that listener.

`src/preload/index.d.ts` declares `Window.library: LibraryApi` for the renderer project.
