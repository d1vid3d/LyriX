# Styles and Visual Rules

**Purpose:** theme variables and the presentation rules for the app shell, lyric view, Now Playing,
source menu, and translation controls.

**Owning source paths:** `src/renderer/src/style.css`, `src/renderer/styles/lyrics.css`,
`src/renderer/styles/lyricSourceMenu.css`, `src/renderer/styles/contextMenu.css`,
`src/renderer/styles/queuePanel.css`, `src/renderer/styles/toast.css`.

**Last verified:** 2026-11-08 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md),
[renderer/lyric-view.md](lyric-view.md), [renderer/lyric-source-menu.md](lyric-source-menu.md),
[renderer/queue-panel.md](queue-panel.md),
[renderer/context-menu-and-toasts.md](context-menu-and-toasts.md), [renderer/ui-map.md](ui-map.md).

## App shell and layout (`src/renderer/src/style.css`)

Theme variables (`--bg`, `--panel`, `--border`, `--text`, `--muted`, `--accent`), toolbar, views,
album grid, artist rows, track lists, detail views, player bar, and scrollbars.

## Lyric and Now Playing presentation (`src/renderer/styles/lyrics.css`)

All lyric and Now Playing presentation. Variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `--lyric-font-size` | `20px` | Base lyric size. |
| `--lyric-font-size-current` | `23px` | Current-line size. |
| `--lyric-color-upcoming` | `#70707a` | Dim future lines/words. |
| `--lyric-color-past` | `#55555d` | Past/ended lines. |
| `--lyric-color-active` | `#f1f1f4` | Bright current-line text. |
| `--lyric-color-sung` | `var(--accent)` | Sung words and fill. |
| `--lyric-line-gap` | `14px` | Space between lines. |
| `--lyric-translation-font-size` | `calc(var(--lyric-font-size) * 0.8)` | Translation size under each line. |
| `--lyric-translation-color-upcoming` | `#5a5a63` | Dim future translations. |
| `--lyric-translation-color-past` | `#45454c` | Past/ended translations. |
| `--lyric-translation-color-active` | `#c9c9d2` | Current/overlapping translations. |
| `--lyric-translation-gap` | `4px` | Space between a line and its translation. |
| `--lyric-transition` | color/opacity/font-size/transform 180 ms ease | Line transitions. |
| `--lyric-transition-fast` | color 120 ms linear | Segment transitions. |

## Source menu and translation toggle (`src/renderer/styles/lyricSourceMenu.css`)

Source chip and popover presentation. It defines its own variables at the top, all derived from the
theme where possible: `--lsm-font-size`, `--lsm-small-font-size`, `--lsm-background`, `--lsm-border`,
`--lsm-text`, `--lsm-muted`, `--lsm-accent`, `--lsm-warning`, `--lsm-hover`, `--lsm-badge-background`,
`--lsm-radius`, `--lsm-radius-small`, `--lsm-radius-pill`, `--lsm-shadow`, `--lsm-padding`,
`--lsm-row-padding`, `--lsm-gap`, `--lsm-popover-min-width`, `--lsm-popover-max-width`,
`--lsm-popover-max-height`, `--lsm-z-index`, and `--lsm-disabled-opacity`.

Menu visual rules:

- The trigger is a quiet pill above the lyric scroller; the `Auto` tag is a small muted pill.
- The popover is right-aligned under the chip, has a border/shadow, scrolls when taller than
  `--lsm-popover-max-height`, and stays above the lyric area via `--lsm-z-index`.
- Rows are comfortable padded radio rows; badges are small muted pills; the `In use` pill uses the
  accent color; warning badges use `--lsm-warning`.
- Disabled rows use `--lsm-disabled-opacity` and no hover/cursor affordance.
- The Translation section reuses the preference-title styling, adds a small switch control
  (`--lsm-switch-*`), a muted hint line, and the same row/badge visuals as sources. Language badges
  are muted; alignment warnings reuse `--lsm-warning`.
- The quick translation pill reuses the trigger padding/border/radius variables and uses the accent
  color for its pressed (`aria-pressed="true"`) state.
- Focus-visible outlines use the accent color on the chip, rows, preference options, translation
  switch/rows, quick toggle, and Reload.

## Context menu (`src/renderer/styles/contextMenu.css`)

Floating menu presentation. Variables at the top: `--context-menu-x`, `--context-menu-y`,
`--context-menu-z-index`, `--context-menu-min-width`, `--context-menu-max-width`,
`--context-menu-padding`, `--context-menu-gap`, `--context-menu-radius`, `--context-menu-item-radius`,
`--context-menu-item-padding`, `--context-menu-font-size`, `--context-menu-hint-size`,
`--context-menu-background`, `--context-menu-border`, `--context-menu-hover`, `--context-menu-text`,
`--context-menu-muted`, and `--context-menu-shadow`.

The menu is `position: fixed` at the `--context-menu-x/y` custom properties (set by JS), sits above
the queue panel and source menu, and animates in with a short fade/slide. Items are full-width
buttons with hover and accent focus-visible states; disabled items dim and lose the pointer cursor;
hints are small muted text; separators are 1 px inset lines.

## Queue panel (`src/renderer/styles/queuePanel.css`)

Slide-over presentation. Variables at the top: `--queue-panel-width`, `--queue-panel-z-index`,
`--queue-panel-background`, `--queue-panel-border`, `--queue-panel-radius`, `--queue-panel-shadow`,
`--queue-panel-header-padding`, `--queue-panel-row-height`, `--queue-panel-row-padding`,
`--queue-panel-row-gap`, `--queue-panel-cover-size`, `--queue-panel-muted`,
`--queue-panel-current-background`, `--queue-panel-hover`, `--queue-panel-insert-color`,
`--queue-panel-insert-height`, `--queue-panel-insert-top`, `--queue-panel-row-shift`,
`--queue-panel-drag-x`, `--queue-panel-drag-y`, `--queue-panel-drag-width`,
`--queue-panel-drag-transition`, `--queue-panel-ghost-background`, and
`--queue-panel-ghost-z-index`.

The panel is absolutely positioned on the right edge of the content area, above the views and Now
Playing but below the player bar and the lyric source menu. The header is fixed; the row area scrolls.
Entry rows use a grid of drag handle / small cover / title+artist / duration / remove. The current row
uses an accent left bar and tinted background; history rows dim. Section rows are uppercase muted
labels with a count and optional chevron. The insertion indicator is a 2 px accent line positioned by
`--queue-panel-insert-top`.

While dragging (`.queue-panel--dragging`), upcoming entry rows transition `transform` over
`--queue-panel-drag-transition` and are individually shifted by `--queue-panel-row-shift` to open the
drop hole; the source row (`.queue-entry--source`) is transparent but keeps its space. The floating
clone (`.queue-drag-ghost`) is fixed at `--queue-panel-drag-x/y` with `--queue-panel-drag-width`, sits
in a higher layer, and is non-interactive. Dragging also sets a grabbing cursor on the body.

## Toasts (`src/renderer/styles/toast.css`)

Variables: `--toast-bottom`, `--toast-z-index`, `--toast-padding`, `--toast-radius`,
`--toast-background`, `--toast-border`, `--toast-shadow`, and `--toast-font-size`. The region is fixed
bottom-center above the player bar, centered with a transform, and non-interactive. The single toast
is a small dark pill with a border/shadow, truncates long text, and fades/slides in when shown. There
is no toast stack.

## Lyric visual rules

- Upcoming lines are dim; past lines are dimmer; the current line is full opacity, slightly larger,
  and shifted right.
- Ended primary lines are dimmed.
- The current line's unsung words use `--lyric-color-active`, so the whole line reads as highlighted
  while the accent fill sweeps through it.
- Sung segments use `--lyric-color-sung`.
- The active segment uses `background-clip: text` with a left-to-right gradient: sung color up to
  `--progress`, active color after it. `-webkit-text-fill-color: transparent` reveals the gradient;
  `color` stays opaque so leaving the active state never flashes dark.
- `.lyric-translation` is a block under the line text, smaller, wrapping normally. It follows the
  line state through ancestor classes: the current line is bright, other overlapping active lines
  are slightly dimmer, and past/upcoming/ended translations stay dim. It inherits the line's
  movement/scale and transitions through the DOM hierarchy.
- Plain documents are static: no highlight, no seek cursor.
- Now Playing uses a 280 px cover column beside the lyrics; at ≤ 820 px it stacks the cover/meta above
  the lyrics.
- The bottom-bar track target gets hover/focus styling and a pointer cursor.
- Shuffle and Repeat share `.control-button`; their pressed state (`aria-pressed="true"`) uses the
  accent border/text color. `.repeat-one-badge` is an absolutely positioned accent "1" shown only for
  `data-repeat="one"`. Detail-view Play/Shuffle buttons reuse the header button styling.

For lyric presentation, JavaScript never sets inline visual styles except the `--progress` custom
property. Floating menu positions, the queue insertion indicator, drag ghost position, and row shift
distances likewise use CSS custom properties (`--context-menu-x/y`, `--queue-panel-insert-top`,
`--queue-panel-drag-x/y/width`, `--queue-panel-row-shift`). (The virtual list and layout code still
set structural inline styles such as position, height, and transform.)

Class names, `data-*` attributes, and ARIA roles are owned by [renderer/lyric-view.md](lyric-view.md),
[renderer/lyric-source-menu.md](lyric-source-menu.md), and [renderer/ui-map.md](ui-map.md).
