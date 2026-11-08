# UI Structure and Interaction Map

**Purpose:** the app-shell regions, element ownership, keyboard map, and accessibility contract.

**Owning source paths:** `src/renderer/index.html`, `src/renderer/src/dom.ts`, plus the controllers
and components named below.

**Last verified:** 2026-11-06 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md),
[renderer/shell-and-navigation.md](shell-and-navigation.md),
[renderer/playback.md](playback.md), [renderer/lyric-source-menu.md](lyric-source-menu.md),
[renderer/styles.md](styles.md).

## Markup regions (`src/renderer/index.html`)

- **Toolbar** — Open Folder, Rescan, status, scan progress, view switcher, sort select, search.
- **Albums view** — album grid + empty state.
- **Artists view** — artist list + empty state.
- **Tracks view** — virtualized track list + empty state.
- **Album detail** — back button, cover, title/artist/year, Play and Shuffle, ordered track list.
- **Artist detail** — back button, artist name/counts, Play and Shuffle, album grid.
- **Now Playing** — close button, large cover, title/artist/album, translation quick toggle, lyric
  source chip + popover (including the Translation section), lyric status/scroller.
- **Player bar** — clickable current-track target, Shuffle/Previous/Play/Pause/Next/Repeat, time, seek,
  duration, volume.
- **Audio element** — hidden `<audio id="audio">`.

Element ids are looked up once by `getAppElements()`; see
[renderer/shell-and-navigation.md](shell-and-navigation.md).

## Keyboard

| Key | Action |
| --- | --- |
| `Ctrl/Cmd+F` | Focus and select search. |
| `/` | Focus search when not in a text input. |
| `Escape` | Close the source menu if open (consumed); otherwise close Now Playing if open; otherwise clear search if focused/non-empty. |
| `Enter`/`Space` | Activate the bottom-bar target or a focused lyric line. |
| `Enter`/`Space`/`ArrowDown` on the source chip | Open the source menu and focus its first enabled item. |
| `ArrowUp`/`ArrowDown` in the source menu | Move focus through enabled items, skipping disabled ones and wrapping. |
| `Home`/`End` in the source menu | Focus the first/last enabled item. |
| `Enter`/`Space` in the source menu | Activate the focused source, preference, translation switch, translation row, or Reload action. |
| `Escape` in the source menu | Close the menu and return focus to the chip; does not close Now Playing or clear search. |
| `Tab` in the source menu | Close the menu. |
| Click/Enter/Space on the translation quick toggle | Show or hide the selected translation. |

## Accessibility details

- View buttons use `aria-pressed`.
- Shuffle and Repeat use `aria-pressed` with state-driven `aria-label`/`title`; Repeat also exposes
  `data-repeat` and a decorative "1" badge for repeat-one.
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
[renderer/lyric-view.md](lyric-view.md), and
[renderer/lyric-source-menu.md](lyric-source-menu.md). The visual rules are owned by
[renderer/styles.md](styles.md).
