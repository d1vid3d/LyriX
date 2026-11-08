# Editable Queue Panel

**Purpose:** the visible play queue: the pure row model, the controller that mutates the queue, the
virtualized slide-over DOM, drag/keyboard reordering, and the player-bar toggle.

**Owning source paths:** `src/renderer/queue/queuePanelModel.ts`,
`src/renderer/queue/dragReorder.ts`, `src/renderer/ui/queuePanel.ts`,
`src/renderer/src/queuePanelController.ts`, `src/renderer/styles/queuePanel.css`.

**Last verified:** 2026-11-08 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md) (invariant 10),
[renderer/playback.md](playback.md) (the queue itself), [renderer/ui-map.md](ui-map.md),
[renderer/context-menu-and-toasts.md](context-menu-and-toasts.md),
[renderer/styles.md](styles.md), [performance.md](../performance.md).

## Row model (`src/renderer/queue/queuePanelModel.ts`)

`buildQueuePanelModel({ snapshot, historyCollapsed, findAlbum })` is pure and DOM-free. It splits the
snapshot into the current entry, the upcoming entries, and history (everything before the current
entry), then emits one flat `rows` array for virtualization.

- Every row has a shared height, `QUEUE_PANEL_ROW_HEIGHT` (56 px), including section headers and the
  empty row. The panel shows the empty text `Nothing queued. Play something to start.` when the queue
  is empty.
- Section rows are `Now playing`, `Next up`, and `History`. `History` is collapsible and starts
  collapsed; `Next up` and `Now playing` are never collapsible. Section labels carry their entry
  counts.
- Entry rows carry `entryId`, `entryIndex`, `section`, `track`, `albumId`, `coverUrl`,
  `artistName`, `durationLabel`, `isCurrent`, `canDrag`, and `canRemove`. `canDrag` is true only for
  `Next up`; `canRemove` is false for the current entry.
- The header model carries `contextLabel` from the queue context (`Album · …`, `Artist · …`,
  `Search · …`, `Tracks`, or `Queue`), `countLabel` (`1 track` / `N tracks`), `durationLabel`, the
  combined `summaryLabel`, `clearDisabled`, `currentEntryId`, `currentIndex`, `currentRowIndex`,
  `upcomingStartRow`, `upcomingRowCount`, and `upcomingEntryIds`.
- With no current entry, every entry is treated as upcoming, so a queue filled only by play-next is
  still visible and reorderable.

## Controller (`src/renderer/src/queuePanelController.ts`)

The controller owns the history-collapsed flag and the latest model. It subscribes to queue snapshots
and rebuilds the model on every change. It translates DOM intents into queue mutations:

- `open`/`close`/`toggle` refresh and drive the panel, then notify the player bar so the toggle's
  `aria-pressed`/`aria-expanded` stay in sync.
- `handleClear` calls `clearUpcoming()` and toasts `Queue cleared` only when something was removed.
- `handlePlayEntry` calls `jumpTo` and starts the current track; `handleRemoveEntry` calls `remove`
  (the queue refuses the current entry) and toasts `Removed from queue`.
- `handleReorderEntry` maps an upcoming insertion slot to a `queue.move` destination with
  `moveDestinationForSlot`; `handleMoveEntry` uses `keyboardMoveTarget` for Alt+Arrow moves.
- `handleToggleHistory` flips the collapsed flag and refreshes.
- The panel click on a row's context menu is forwarded to the composition root, which builds the
  queue-row menu owned by
  [renderer/context-menu-and-toasts.md](context-menu-and-toasts.md).

## Panel DOM (`src/renderer/ui/queuePanel.ts`)

The panel is an `<aside id="queue-panel">` inside `main.content`. It is positioned absolutely over the
content and Now Playing areas but remains under the player bar; the lyric source menu stays above it.
It contains a header (context label, count/duration summary, Clear, close) and one scroll container.
Rows render through the shared `VirtualList` with the fixed 56 px row height, so a 2000+ entry queue
keeps a bounded DOM. On queue updates while open, `VirtualList.setItems(rows, { preserveScroll: true })`
keeps the current scroll offset; the current entry is scrolled into view only when the panel opens.

Each entry row exposes a drag handle, a small cover, title, artist, duration, and a remove button. The
current row is highlighted with `aria-current="true"`; history rows are dimmed.

Interactions:

- Double-click or `Enter` on a row plays that entry.
- The remove button, `Delete`, or `Backspace` removes a non-current entry.
- Right-click or `Shift+F10`/the Menu key opens the queue-row menu.
- `ArrowUp`/`ArrowDown` move row focus, `Home`/`End` jump to the first/last entry.
- `Alt+ArrowUp`/`Alt+ArrowDown` moves a `Next up` entry one slot; moves stop at the current entry and
  the end of the queue.
- Dragging starts only from the handle of a `Next up` row. The row is cloned into a fixed
  `queue-drag-ghost` that follows the pointer (decorative, `aria-hidden`, no pointer events), while
  the source row keeps its layout space but is hidden. `dragReorder.ts` maps the pointer to an
  insertion slot; every intervening upcoming row shifts one row up or down with a short CSS transform
  transition, so the drop hole opens where the row will land. The insertion line marks the top of
  that hole. Dragging near the top/bottom edge auto-scrolls, and freshly rendered rows reapply the
  same shift state. `Escape` or `pointercancel` cancels without committing; `pointerup` removes the
  ghost and commits through the controller. The destination is computed for the post-removal list
  before `queue.move`.
- Only one panel is open; the toggle button and `Q` (when no text input has focus and no floating
  menu is open) both toggle it.

## Styling and accessibility

`styles/queuePanel.css` defines the panel width, z-index, row grid, drag handle, current/history
states, section headers, empty row, and insertion indicator. Dynamic indicator position uses the
`--queue-panel-insert-top` custom property; no visual inline styles are set elsewhere. Rows are a
`role="list"` with entry rows as list items, section headers as presentational rows, and the History
header as a disclosure button with `aria-expanded`. The player-bar toggle uses an inline SVG icon,
`aria-label="Queue"`, and synchronized `aria-pressed`/`aria-expanded`.

The Escape priority order is owned by [renderer/ui-map.md](ui-map.md). The queue model itself is owned
by [renderer/playback.md](playback.md); this panel never changes queue semantics.
