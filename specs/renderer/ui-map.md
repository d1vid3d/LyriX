# UI Structure and Interaction Map

**Purpose:** the app-shell regions, element ownership, keyboard map, and accessibility contract.

**Owning source paths:** `src/renderer/index.html`, `src/renderer/src/dom.ts`, plus the controllers
and components named below.

**Last verified:** 2026-11-10 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md),
[renderer/shell-and-navigation.md](shell-and-navigation.md),
[renderer/playback.md](playback.md), [renderer/lyric-source-menu.md](lyric-source-menu.md),
[renderer/styles.md](styles.md).

## Markup regions (`src/renderer/index.html`)

- **Toolbar** — Open Folder, Rescan, status, scan progress,
  Albums/Artists/Tracks/Favorites/Recent view switcher, sort select, search, and a `?`
  keyboard-shortcuts button.
- **Albums view** — album grid + empty state.
- **Artists view** — artist list + empty state.
- **Tracks view** — virtualized track list + empty state.
- **Favorites view** — header with title, status line, optional Why, Play/Shuffle, a virtualized
  favorites list, an exact empty state, and a collapsed missing-favorites section.
- **Recently played view** — header with title, status line, optional Why, Record-history toggle,
  Clear history, Play/Shuffle, a virtualized history list with play-count/relative-time meta, and
  off/empty states with a Start-recording action.
- **Album detail** — back button, cover, title/artist/year, Play and Shuffle, ordered track list.
- **Artist detail** — back button, artist name/counts, Play and Shuffle, album grid.
- **Now Playing** — close button, large cover, title/artist/album, translation quick toggle, lyric
  source chip + popover (including the Translation section), lyric status/scroller.
- **Queue panel** — slide-over inside the content area with context/summary header, Clear/close,
  Now playing/Next up/History sections, and a virtualized entry list.
- **Player bar** — clickable current-track target, Shuffle/Previous/Play/Pause/Next/Repeat/Queue,
  time, seek, duration, volume.
- **Toast region** — bottom-center live region above the player bar, outside the content area.
- **Shortcuts overlay** — modal `role="dialog"` generated from the shortcut registry, appended to
  `<body>` with a backdrop, category groups, focus trap, and a close button.
- **Data disclaimer** — modal `role="dialog"` with the LyrixData reason, feature list, Retry (busy
  state), and Close; focus-trapped and layer-closed.
- **Clear-history confirmation** — modal `role="dialog"` with Cancel/Confirm; Escape or the backdrop
  cancels.
- **Audio element** — hidden `<audio id="audio">`.

Element ids are looked up once by `getAppElements()`; see
[renderer/shell-and-navigation.md](shell-and-navigation.md).

## Keyboard

Global shortcuts are declared in `renderer/shortcuts/defaultShortcuts.ts` and dispatched by one
listener; component-local keys are listed separately. The full table and matching rules are owned by
[renderer/shortcuts.md](shortcuts.md).

| Key | Action |
| --- | --- |
| `Space` | Play / pause (native button activation wins when a button is focused). |
| `N` / `Ctrl/Cmd+→` | Next track. |
| `P` / `Ctrl/Cmd+←` | Previous track (restarts when more than 3 s in). |
| `J` / `L` | Seek -10 s / +10 s. |
| `Ctrl/Cmd+↑` / `Ctrl/Cmd+↓` | Volume +5% / -5%. |
| `S` | Toggle shuffle. |
| `R` | Cycle repeat. |
| `Q` | Toggle the queue panel when no text input has focus and no floating menu is open. |
| `Ctrl/Cmd+F` | Focus and select search. |
| `/` | Focus search when focus is not in a text-entry/range target. |
| `Ctrl/Cmd+L` | Toggle Now Playing. |
| `T` | Toggle translation when Now Playing is open and the toggle is available. |
| `F` | Toggle the current track's favorite (plain key, typing-guarded). |
| `?` (Shift+/) | Open the keyboard-shortcuts overlay. |
| `Escape` | Close the highest-priority open layer: context menu, data disclaimer, clear-history confirmation, shortcuts overlay, lyric source menu, queue panel, Now Playing, then clear search if focused/non-empty. |
| `Tab` in the shortcuts overlay | Cycle focus inside the dialog; Escape or the backdrop closes it. |
| `Shift+F10` / Menu key | Open the context menu for the focused track row, album card, artist row, queue row, or current-track target. |
| `Enter`/`Space` | Activate the bottom-bar target or a focused lyric line. |
| `Enter`/`Space`/`ArrowDown` on the source chip | Open the source menu and focus its first enabled item. |
| `ArrowUp`/`ArrowDown` in the source menu | Move focus through enabled items, skipping disabled ones and wrapping. |
| `Home`/`End` in the source menu | Focus the first/last enabled item. |
| `Enter`/`Space` in the source menu | Activate the focused source, preference, translation switch, translation row, or Reload action. |
| `Escape` in the source menu | Close the menu and return focus to the chip; does not close the queue panel or Now Playing. |
| `Tab` in the source menu | Close the menu. |
| `ArrowUp`/`ArrowDown` in a context menu | Move focus through enabled items, skipping disabled ones and wrapping. |
| `Home`/`End` in a context menu | Focus the first/last enabled item. |
| `Enter`/`Space` in a context menu | Activate the focused item. |
| `Escape`/`Tab` in a context menu | Close it; Escape restores focus to the origin. |
| Click/Enter/Space on the translation quick toggle | Show or hide the selected translation. |
| `Enter`/double-click on a queue row | Play that queue entry. |
| `Delete`/`Backspace` on a queue row | Remove a non-current entry. |
| `ArrowUp`/`ArrowDown` in the queue panel | Move entry focus; `Home`/`End` jump to the ends. |
| `Alt+ArrowUp`/`Alt+ArrowDown` on a Next up row | Move the entry one slot. |
| Drag a Next up row's handle | Reorder with an insertion indicator and edge auto-scroll; `Escape` cancels. |

## Accessibility details

- View buttons use `aria-pressed`.
- Shuffle and Repeat use `aria-pressed` with state-driven `aria-label`/`title`; Repeat also exposes
  `data-repeat` and a decorative "1" badge for repeat-one.
- The queue toggle uses `aria-pressed` and `aria-expanded`, synchronized with the panel, and exposes
  `aria-keyshortcuts="Q"`.
- The shortcuts help button exposes `aria-keyshortcuts="?"`; the overlay uses `role="dialog"`,
  `aria-modal="true"`, a labelled title, `kbd` chord labels, a Tab focus trap, and returns focus to
  its opener.
- Favorite hearts use `aria-pressed` with state-driven `aria-label`/title; the Favorites missing
  disclosure uses `aria-expanded`; the data disclaimer and clear-history confirmation use the same
  modal/focus contract.
- The Record-history toggle uses `aria-pressed` and a state-driven label.
- The queue panel is a `role="list"`; entry rows are list items, `aria-current="true"` marks the
  playing entry, the History header is a disclosure button with `aria-expanded`, and the insertion
  indicator is decorative.
- Context menus use `role="menu"`/`role="menuitem"`, skip disabled items while roving focus, and set
  `disabled` + `aria-disabled="true"`; separators use `role="separator"`.
- Toasts live in an `aria-live="polite"`/`aria-atomic="true"` region, are non-focusable, and never
  block pointer input.
- Playing tracks use `aria-current="true"`.
- Lyric lines are focusable buttons only when timed.
- The source chip uses `aria-haspopup="menu"` and a synchronized `aria-expanded`.
- The source popover is `role="menu"` with labelled `role="group"` sections; source and preference
  rows use `role="menuitemradio"` + `aria-checked`, the translation switch uses
  `role="menuitemcheckbox"` + `aria-checked`, Reload uses `role="menuitem"`, and disabled rows use
  `disabled` + `aria-disabled="true"`.
- The translation quick toggle uses `aria-pressed`, a model-driven `title`, and an accessible label.
- Translation elements set `lang` only when the selected option's variant is a valid language tag.
- Focus-visible outlines use the accent color.
- Status/progress elements use `role="status"`.

The behavior behind these attributes is owned by
[renderer/shell-and-navigation.md](shell-and-navigation.md),
[renderer/queue-panel.md](queue-panel.md),
[renderer/context-menu-and-toasts.md](context-menu-and-toasts.md),
[renderer/lyric-view.md](lyric-view.md), and
[renderer/lyric-source-menu.md](lyric-source-menu.md). The visual rules are owned by
[renderer/styles.md](styles.md).
