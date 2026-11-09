# Context Menus, Menu Actions, and Toasts

**Purpose:** the generic right-click/Shift+F10 menu, the pure menu builders and action dispatcher,
the one-at-a-time toast region, and the reveal-in-file-manager entry point.

**Owning source paths:** `src/renderer/ui/contextMenu.ts`, `src/renderer/ui/menuTrigger.ts`,
`src/renderer/menus/contextMenuModels.ts`, `src/renderer/menus/contextActions.ts`,
`src/renderer/menus/toastMessages.ts`, `src/renderer/ui/toast.ts`,
`src/renderer/styles/contextMenu.css`, `src/renderer/styles/toast.css`,
`src/main/pathContainment.ts`, `src/main/reveal.ts`.

**Last verified:** 2026-11-08 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md) (invariants 1 and 2),
[renderer/playback.md](playback.md), [renderer/queue-panel.md](queue-panel.md),
[renderer/ui-map.md](ui-map.md), [main/lifecycle-and-ipc.md](../main/lifecycle-and-ipc.md),
[security-and-robustness.md](../security-and-robustness.md).

## Generic menu (`src/renderer/ui/contextMenu.ts`)

`ContextMenu<Item extends MenuItem>` is a single floating `role="menu"` element appended to `<body>`.
It knows nothing about tracks or queues.

- `show(items, position, options?)` replaces any open menu first, calls the injected `onOpen`, renders
  `role="menuitem"` buttons, positions the element, binds transient listeners, and focuses the first
  enabled item. `position` is either viewport `{ x, y }` or `{ anchor: HTMLElement }`.
- `close(restoreFocus = false)` hides the menu, unbinds listeners, and calls the per-show `onClose`
  exactly once; it restores focus to the origin only when asked and the origin is still visible.
- `isOpen()` and `destroy()` complete the lifecycle.
- Items are `{ id, label, disabled?, separator?, hint?, submenu? }`. `submenu` is reserved for a
  later feature and currently only adds `aria-haspopup="menu"`/`aria-expanded="false"`; no submenu is
  rendered.
- Positioning flips/clamps at the viewport edges (8 px padding), adding a 4 px gap below an anchor.
- `Escape` closes and restores focus; `Tab`, outside pointer-down, window blur, window resize, and
  scrolling of the origin's scroll parent close without restoring focus. `ArrowUp`/`ArrowDown`,
  `Home`/`End`, and `Enter`/`Space` use the shared enabled-index helpers from
  `lyrics/sourceMenuModel.ts` and skip disabled items.
- Only one menu may be open. The context menu's `onOpen` closes the lyric source menu, and the lyric
  source menu's `onOpen` closes the context menu.

`attachMenuTrigger(element, open)` wires `contextmenu` (prevented, focuses the target, opens at the
pointer) and `Shift+F10`/`ContextMenu` (opens anchored to the element). It is never attached to text
inputs, so their native context menu remains available.

## Menu models (`src/renderer/menus/contextMenuModels.ts`)

Builders are pure and return `ContextMenuItem` values with a typed `action` and a full payload
(`track`, `tracks`, `album`, `artist`, `albumId`, `artistName`, `entryId`, `context`, `play`).

| Builder | Labels |
| --- | --- |
| `buildTrackMenu({ track, album, play, isFavorite })` | `Play`, `Play next`, `Add to queue`, `Add to Favorites`/`Remove from Favorites`, `Go to album`, `Go to artist`, `Show in file manager` |
| `buildAlbumMenu({ album })` | `Play`, `Shuffle`, `Play next`, `Add to queue`, `Go to artist`, `Show in file manager` |
| `buildArtistMenu({ artist })` | `Play`, `Shuffle`, `Play next`, `Add to queue` |
| `buildQueueRowMenu(row)` | `Play now`, `Play next`, `Move to top of Next up`, `Move to bottom`, `Remove`, favorite toggle, `Go to album`, `Go to artist`, `Show in file manager` |
| `buildCurrentTrackMenu({ track, albumId, artistName, isFavorite })` | Favorite toggle, `Go to album`, `Go to artist`, `Show in file manager` |

Album queue labels append `(N tracks)` when the count is greater than one. Track menus use
the exact row play closure and an album context (or an `other`/`Tracks` context when the track has no
album). Album menus reveal the album's first track (the reveal item is disabled for a trackless album)
and dispatch `album.goToArtist` through the same navigation path as the track menu. For a current
queue row, `Play next`, the two move actions, and `Remove` are disabled.

The composition root attaches these builders to album cards, artist rows, album-detail tracks,
virtual track rows, queue rows, and the player-bar current-track target.

## Action dispatch (`src/renderer/menus/contextActions.ts`)

`ContextActions.run(item)` ignores separators, disabled items, and missing actions. It receives
injected queue, transport, navigation, library-lookup, toast, and reveal dependencies and dispatches:

- `*.play` runs the row play closure or `transport.playQueue`; `album.shuffle`/`artist.shuffle` use the
  transport's shuffle entry points.
- Play next / add to queue with an empty queue start the first added track immediately: the action
  calls `queue.setQueue(tracks, 0, { context })` then `transport.startCurrentTrack(true)`, because
  `playNext` alone only fills a queue with no current entry. Otherwise it calls `queue.playNext` or
  `queue.addToQueue`.
- Queue-row actions use `jumpTo` + start, `move` to the top of Next up / bottom, or `remove`, and
  toast the result. Favorite toggles on track/queue/current menus call the injected favorites action.
- The favorites action is throttled only by the optimistic controller; success toasts `Added to
  Favorites`/`Removed from Favorites`, while failures open the disclaimer instead.
- Go to album/artist validates the target through the injected library lookup, opens it through
  navigation (which closes Now Playing via the existing navigation hook), and toasts
  `Couldn't open that album` / `Couldn't open that artist` when the target is missing. This applies to
  track, album, queue-row, and current-track menus.
- Reveal calls `revealTrack(trackId)` and toasts `Couldn't show the file` when main returns `false`.

Toast text owns no punctuation drift: `Playing next: <title>` (or `Playing next: N tracks`),
`Added to queue: <title>` (or `Added N tracks to queue`), `Removed from queue`, `Queue cleared`, and
the three failure messages above. `toastMessages.ts` truncates long titles to `TOAST_TITLE_MAX`.

## Toasts (`src/renderer/ui/toast.ts`)

`Toast` creates one `.toast` element inside `#toast-region`. A new message replaces the current text
and restarts the timer; the default is 2500 ms and the element hides itself. There is never more than
one toast. The region is fixed bottom-center above the player bar, uses `aria-live="polite"` and
`aria-atomic="true"`, is `pointer-events: none`, and contains no focusable element, so it never steals
focus or blocks clicks. `show('')` is a no-op; `hide`/`destroy` clear the timer.

## Reveal in the file manager

The renderer never sends a path. `window.library.revealTrack(trackId)` invokes
`library:reveal-track`; main resolves the path from the scanned library and validates it:

1. The id must be a 40-character lowercase SHA-1 string.
2. `resolveTrackFile(trackId)` must return an indexed path and the library root must exist.
3. Both paths are passed through `fs.realpath`; `isRevealPathAllowed` requires a strict descendant of
   the root (via `isPathInside` in `src/main/pathContainment.ts`) with a `.flac` extension.
4. The canonical path must be a regular file.
5. `shell.showItemInFolder` is called; any error is logged and resolves to `false`.

The IPC handler never throws. The renderer's library lookup and reveal button are owned by
[renderer/shell-and-navigation.md](shell-and-navigation.md) and
[renderer/queue-panel.md](queue-panel.md); the security rationale is in
[security-and-robustness.md](../security-and-robustness.md).
