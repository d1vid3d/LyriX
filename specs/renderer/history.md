# Recently Played View and History UI

**Purpose:** the renderer-side history state, quiet failure handling, Recently played view, status
/empty models, relative-time formatter, Record-history toggle, and Clear-history confirmation.

**Owning source paths:** `src/renderer/history/` (`playTracker.ts`, `historyController.ts`,
`historyStatusModel.ts`, `relativeTime.ts`, `onceNotifier.ts`),
`src/renderer/src/views/recentView.ts`, `src/renderer/src/screen.ts`,
`src/renderer/src/views/tracksList.ts`, `src/renderer/styles/history.css`,
`src/renderer/ui/confirmDialog.ts`, `src/renderer/styles/confirmDialog.css`,
`src/renderer/library/query.ts`, `src/renderer/favorites/dataDisclaimerModel.ts`.

**Last verified:** 2026-11-10 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md) (invariant 13),
[main/history.md](../main/history.md), [renderer/favorites.md](favorites.md),
[renderer/shortcuts.md](shortcuts.md), [renderer/ui-map.md](ui-map.md),
[renderer/playback.md](playback.md).

## Controller

`HistoryController` mirrors `{ items, recording, loaded }` and is DOM-free:

- `record(trackId)` is fire-and-forget and never opens the disclaimer.
- Passive failures: when `history:changed` reports `blocked` while recording was expected to work,
  one quiet toast per library per session is shown (`OnceNotifier`), with read-only and unavailable
  variants. `noteLibraryChanged()` resets that notifier.
- `setRecording` and `clear` are explicit actions; failures call the injected
  `onWriteBlocked(reason, retryAction)` so the existing disclaimer opens and can retry once.
- `start()` subscribes to `history:changed`; `reload()`/`noteLibraryChanged()` refresh after startup
  and each library snapshot.

The tracker's `onCounted` is wired directly to `historyController.record`.

## Models

`buildHistoryStatusModel(recording)`:

- recording: "Recording to this library's LyrixData folder"
- off: "History isn't being recorded for this library."
- not-created: "History isn't being recorded yet. Turn on Record history to create this library's LyrixData folder."
- blocked: read-only / unavailable / newer-version variants with a `Why?` action.

`buildHistoryEmptyModel(recording, hasItems)`:

- not enabled: "History isn't being recorded for this library. Start recording" + Start action.
- enabled but empty: "Nothing played yet."

`formatRelativePlayedAt(at, nowMs, locale?)` returns `Just now`, `N min ago`, `Today HH:MM`,
`Yesterday`, or a locale date. `formatHistoryMeta` prepends `N play(s) ·`.

## Recently played view

`LibraryView` gains `recent`; `VIEWS.recent` builds items from the current albums filtered by the
resolved history list. Sorts are Last played (default), Most played, Title, Artist, and Album; search
uses the normal matcher. `buildLibraryIndex(albums, favorites?, history?)` takes plain history data so
the registry stays DOM-free.

`RecentView` renders the header (`Play`, `Shuffle`, Record-history toggle, Clear history, optional
`Why?`, status line), a virtualized `TracksList` with its optional meta slot (`N plays · relative`),
the empty state, and a Start-recording button. Play/Shuffle queue the visible list with the new
`{ kind: 'recent', label: 'Recently played' }` context. Clear history opens the confirmation modal;
Escape/backdrop cancel.

The confirmation modal (`ui/confirmDialog.ts`) is a focus-trapped `role="dialog"` registered in the
Escape layer stack at priority 53, above the shortcuts overlay and below the data disclaimer.

## Styling

`styles/history.css` owns the Recent header/status/actions/start/meta variables and rules.
`styles/confirmDialog.css` owns the modal variables/rules. Tracks rows gained one optional grid
column for the meta slot; all visuals use classes and CSS variables.
