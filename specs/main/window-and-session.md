# Window State, Single Instance, Session Resume, and Media Keys

**Purpose:** the machine-local shell state kept outside the music library: window bounds, the
single-instance lock, the resume session files and flow, and the main-process media-key route.

**Owning source paths:** `src/main/windowBounds.ts`, `src/main/windowState.ts`,
`src/main/window.ts`, `src/main/index.ts`, `src/main/sessionValidation.ts`,
`src/main/sessionWritePolicy.ts`, `src/main/sessionStore.ts`, `src/main/mediaKeys.ts`,
`src/shared/mediaKeys.ts`.

**Last verified:** 2026-11-08 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md) (invariants 2, 6, 8, and 12),
[persistence.md](../persistence.md), [main/lifecycle-and-ipc.md](lifecycle-and-ipc.md),
[renderer/shortcuts.md](../renderer/shortcuts.md), [renderer/playback.md](../renderer/playback.md),
[security-and-robustness.md](../security-and-robustness.md).

## Window state (`src/main/windowBounds.ts`, `src/main/windowState.ts`)

`resolveWindowBounds(saved, displays, defaults, minSize)` is pure and returns
`{ bounds, maximized }`:

- Missing or malformed saved bounds fall back to the defaults, centered on the primary display's
  work area.
- Width/height are clamped to the minimum window size.
- Bounds that no longer keep a usable strip (at least 120 px, or the window size when smaller)
  inside any connected work area are recentered on the primary display, covering unplugged
  monitors and off-screen positions.
- The saved maximized flag is passed through.

`WindowStateWriter` debounces `resize`/`move`/`maximize`/`unmaximize` writes by 500 ms and writes
`userData/window-state.json` atomically on close. State is captured from `getNormalBounds()` plus
`isMaximized()` so maximizing never overwrites the normal size. Reads are tolerant: a wrong version
or malformed data means "no saved state".

`WindowManager.createWindow(saved)` restores the resolved bounds, maximizes before showing when
requested, and wires the debounced writer. `focusOrCreate()` restores a minimized window, shows and
focuses it, or recreates it when needed.

## Single instance (`src/main/index.ts`)

`app.requestSingleInstanceLock()` runs before `whenReady`. A second process quits immediately; the
primary instance listens for `second-instance` and calls `windows.focusOrCreate()`. This protects the
settings, cache, session, and window-state files from concurrent writers.

## Session files

Two machine-local files avoid rewriting a potentially huge queue on every position update:

| Path | Contents |
| --- | --- |
| `session-queue.json` | `{ version: 1, folder, queue: SessionQueueState }`. |
| `session-position.json` | `{ version: 1, folder, position: SessionPositionState }`. |

`SessionQueueState` is `{ version: 1, entries: [{ entryId, trackId, origin }], originalOrder,
currentEntryId, context }`; tracks are referenced by id only. `SessionPositionState` is
`{ entryId, trackId, position }`. Main stamps `folder` from the current library root on every write
and compares it on load; a mismatch means the session is discarded.

`sessionValidation.ts` (pure) caps entries at 50,000, bounds ids at 128 characters and labels at
200, requires 40-character lowercase SHA-1 track ids, drops duplicate entry ids, normalizes origins,
and requires a finite non-negative position. It also drops a position whose entry/track no longer
matches the queue. No paths are accepted from the renderer.

`sessionWritePolicy.ts` (pure) decides when to write: queue writes are change-driven; position writes
are change-driven but throttled to 1 s after the first write in a run. `SessionStore` keeps the
latest payload in memory, writes on that decision, and `flush()` force-writes both files.

## Resume flow

1. Main loads settings, library cache, restores the library root, then loads the session if its
   folder matches the current root.
2. The renderer starts, loads settings (including shuffle/repeat), fetches the library snapshot, and
   only then calls `session:get`.
3. If a session exists, `TransportController.restoreSession` imports the queue by track id, keeps its
   play order and natural order (so turning shuffle off restores the same order as before the
   restart), loads the current track, and leaves it paused. The saved position is applied once on
   `loadedmetadata`, and the seek bar shows it.
4. The renderer starts `SessionController` **after** restore, so applying the session cannot write
   the restored state back over the stored session.
5. Queue changes are sent after a ~1 s debounce. Position is sent at most every ~5 s while playing
   and immediately on pause, seek end, and track change (track changes send position 0). Main
   throttles writes and flushes on `before-quit`; the renderer flushes on `beforeunload`.
6. If the queue's current track vanished, the renderer starts at the first surviving entry; if no
   entries survive, the queue is empty. Opening another folder follows the normal reconcile path and
   the next launch discards a session from the old folder.

The queue import/export contract lives in [renderer/playback.md](../renderer/playback.md).

## Media keys (`src/shared/mediaKeys.ts`, `src/main/mediaKeys.ts`)

`MEDIA_KEY_MODE` selects exactly one mechanism so keys never fire twice:

- `media-session` (current): `app.commandLine.appendSwitch('enable-features',
  'HardwareMediaKeyHandling,MediaSessionService')` before ready. Chromium's Media Session service
  wires hardware keys and the Windows system media overlay; the renderer owns metadata, playback
  state, position, and action handlers ([renderer/shortcuts.md](../renderer/shortcuts.md)).
- `global-shortcuts` (fallback, currently off): `globalShortcut.register` for
  `MediaPlayPause`, `MediaNextTrack`, `MediaPreviousTrack`, and `MediaStop` forwards
  `MediaKeyAction` values over `media:key`; shortcuts are unregistered on `will-quit`.

The primary route could not be exercised by automated hardware-key input in the test environment.
The Media Session API and metadata/playback-state publication are asserted by the smoke suite;
hardware keys and the Windows overlay should be checked by hand (see
[testing-and-verification.md](../testing-and-verification.md)).
