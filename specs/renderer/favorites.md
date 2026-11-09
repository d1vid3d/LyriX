# Favorites and the LyrixData Disclaimer UI

**Purpose:** the renderer-side favorites state, optimistic writes, status line, favorites view,
heart hooks, disclaimer modal, and the F shortcut.

**Owning source paths:** `src/renderer/favorites/` (`favoritesController.ts`,
`lyrixDataStatusController.ts`, `dataDisclaimerModel.ts`, `favoritesStatusModel.ts`),
`src/renderer/src/views/favoritesView.ts`, `src/renderer/src/screen.ts`,
`src/renderer/ui/favoriteButton.ts`, `src/renderer/ui/dataDisclaimer.ts`,
`src/renderer/styles/favorites.css`, `src/renderer/styles/dataDisclaimer.css`,
`src/renderer/library/query.ts`.

**Last verified:** 2026-11-08 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md) (invariant 13),
[main/lyrixdata.md](../main/lyrixdata.md), [renderer/playback.md](playback.md),
[renderer/shortcuts.md](shortcuts.md), [renderer/ui-map.md](ui-map.md),
[renderer/styles.md](styles.md).

## Controllers

`LyrixDataStatusController` mirrors `LyrixDataStatus`, subscribes to `lyrixdata:status-changed`, and
exposes `reload()`/`retry()`. It is DOM-free.

`FavoritesController` keeps `{ ids, addedAt, missing, loaded }` and is DOM-free:

- `toggle(id)` / `setMany(ids, favorite)` apply an **optimistic** state change, call
  `favorites:set`, and on success replace state from main and toast `Added to Favorites` or
  `Removed from Favorites`. On failure they roll back and call the injected
  `onWriteBlocked(reason, retryAction)` so the disclaimer can open.
- `removeMissing()` clears the missing rows optimistically; failure rolls back through the same
  disclaimer path. The pending retry re-runs the action once after a successful retry.
- `start()` subscribes to `favorites:changed`; `reload()` re-reads after startup and library changes.
  Main re-resolves favorites on every snapshot update, so the event is the library-change path.

## Status line and disclaimer models

`buildFavoritesStatusModel(status)` produces the header text, tone, and whether the `Why?` action is
shown:

- ready: "Saved in this library's LyrixData folder"
- not-created: "Not created yet. It will be created when you add your first favorite."
- read-only: "This library is read-only. Favorites can't be changed."
- unavailable / newer-version: matching blocked variants with a `Why?` action.

`buildDataDisclaimerModel(reason)` owns the exact dialog messages. The read-only message includes the
feature registry (`LYRIXDATA_FEATURES`, currently `["Favorites"]`; history and playlists append later).
The disclaimer is a modal `role="dialog"` with `aria-modal="true"`, a Retry button that shows
`Retrying…` and is disabled while in flight, and Close. It traps focus, closes on the backdrop or
Escape (via the layer stack at priority 55), returns focus to the opener, and on a successful retry
closes, re-runs the pending action once, and lets the normal toast report the result.

## Favorites view

`LibraryView` gains `favorites`; `VIEWS.favorites` builds items from the current albums filtered by the
favorites ids and carries `addedAt`. Sorts are Recently added (default, newest first), Title, Artist,
and Album. Search uses the normal library matcher.

`FavoritesView` renders the header (`Play`, `Shuffle`, optional `Why?`, status line), the virtualized
row list via a dedicated `TracksList`, the exact empty state
`No favorites yet. Press the heart on any track.`, and a collapsed missing section:
`N favorites couldn't be found in this library`, expanding to a read-only title/artist/album list
with `Remove missing`. Play and Shuffle queue the visible list with the new queue context
`{ kind: 'favorites', label: 'Favorites' }`.

## Heart hooks

`createFavoriteButton` builds an inline-SVG heart with `aria-pressed`, a state-driven
`aria-label`/title (`Add to Favorites` / `Remove from Favorites`), stops row activation, and is
re-synchronized by `syncFavoriteButtons` after each state change. Hearts appear on:

- Tracks view rows (wrapper keeps the row button and heart as siblings);
- album detail track rows;
- every queue panel row (including the current row);
- the player-bar current track (sibling host, not nested in the role=button target);
- the Now Playing header.

## Context menu and shortcut

Track, queue-row, and current-track menus include `Add to Favorites` / `Remove from Favorites`
according to the current state; the actions call the same controller. `F` is registered in the
default shortcut table (category Favorites) and therefore appears in the generated help overlay and
the conflict test.

## Styling

`styles/favorites.css` owns the heart, row-wrapper/heart spacing, Favorites header/status/missing
section variables and rules. `styles/dataDisclaimer.css` owns the modal variables and rules. All
dynamic values use classes and CSS variables; no inline visual styles are set from JS.
