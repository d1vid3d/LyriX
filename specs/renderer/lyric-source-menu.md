# Lyric Source Menu and Translation Toggle

**Purpose:** the pure menu models, the source chip/popover component, its keyboard/ARIA behavior,
and the quick translation pill.

**Owning source paths:** `src/renderer/lyrics/sourceMenuModel.ts`,
`src/renderer/lyrics/translationMenuModel.ts`, `src/renderer/lyrics/translationLabels.ts`,
`src/renderer/lyrics/translationText.ts`, `src/renderer/ui/lyricSourceMenu.ts`,
`src/renderer/ui/lyricSourceMenuView.ts`, `src/renderer/ui/translationToggle.ts`.

**Last verified:** 2026-11-08 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md),
[renderer/lyrics-controller.md](lyrics-controller.md), [renderer/ui-map.md](ui-map.md),
[renderer/styles.md](styles.md), [main/lyric-sources.md](../main/lyric-sources.md).

UNVERIFIED/POSSIBLY STALE: the shared disabled-reason strings and `unavailableReason()` currently
live in `src/renderer/lyrics/lyricMenuText.ts`, a module the original spec did not list. The model
sections below still describe the reasons as part of the menu models.

## Pure source-menu model (`src/renderer/lyrics/sourceMenuModel.ts`)

`buildSourceMenuModel(state)` converts `LyricsState` into every string and flag the menu needs. It
has no DOM or controller references and is covered by `tests/sourceMenuModel.test.ts`.

Model:

- `trigger` — label (`Lyrics: <source>`, `No lyrics`, or `Loading…`), optional `Auto` tag, and
  loading/disabled flags.
- `autoRow` — label, `Using: <active source>` subtext, and checked state (checked unless the current
  selection is saved).
- `rows` — one per `state.sources` in canonical order, with label/detail, saved-choice `checked`,
  `inUse`, disabled/reason, and badges. Badges are format, line count, `Singers`, and warning count
  with the parser warnings as the tooltip.
- `preference` — the `Sidecar` / `Embedded` options and their checked state.
- `reload` — `Reload sources` or `Reloading…`, disabled while loading.
- `emptyState` — `No lyrics found` plus a hint using `expectedSidecarName` or a generic fallback.
- `loadingMessage` — the lyric-view loading text.
- `translation` — `label`, `status` (`off` / `active` / `unavailable` / `needs-choice`), a switch
  (`Show translation`, checked, disabled only while off with no eligible option, hint), an Auto row
  (`Language: <LANG>` when sticky, else `Using: <label>`), and rows only while enabled. Rows carry
  the saved-choice `checked`, `inUse`, disabled/reason (`Currently used as lyrics`, the same
  source-missing reasons, or `Couldn't read any lyric lines`), a muted `Intl.DisplayNames` language
  badge with raw-variant fallback, and an alignment badge. Alignment text is `Matched n/total` for
  time, `Paired by line order` for index, and `Partial match n/total` for partial; a warning tone and
  a one-sentence tooltip appear when `matched < total` or the method is index/partial.
- `translationToggle` — `Translation`, `pressed`, disabled while loading, when there are no lyrics,
  or when translation is off with no eligible option, plus a state-explaining tooltip.

The translation section and quick-toggle model are built by
`src/renderer/lyrics/translationMenuModel.ts`; the language and sidecar-example helpers live in
`translationLabels.ts`, and the per-line text lookup in `translationText.ts`.

Pure keyboard helpers:

- `nextEnabledIndex(enabled, current, step)` wraps and skips disabled entries; `current = -1`
  starts at the first or last enabled entry depending on direction.
- `firstEnabledIndex` / `lastEnabledIndex` back Home/End.

## Source chip and popover (`src/renderer/ui/lyricSourceMenu.ts`)

Constructed with a container and `{ onSelect, onPreference, onTranslationToggle,
onTranslationSelect, onReload }`. It knows nothing about the controller.

- `update(model)` refreshes the chip and, while open, re-renders the popover in place. Focus is
  restored by item key when possible.
- `open()` shows the popover, calls the injected `onOpen` (so the context menu closes), sets
  `aria-expanded="true"`, and focuses the first enabled item.
- `close()` hides it and resets `aria-expanded`. `isOpen()`, `close()` from another popover's
  `onOpen`, and `destroy()` complete the lifecycle, so the source menu and context menu are mutually
  exclusive.
- The chip is a `aria-haspopup="menu"` button. The popover is `role="menu"` with a labelled source
  `role="group"`, the preference `role="group"`, and a Translation section.
- Source and preference rows are `role="menuitemradio"` with `aria-checked`; Reload is
  `role="menuitem"`. Disabled rows get `disabled` and `aria-disabled="true"`.
- The Translation section starts with a `role="menuitemcheckbox"` switch row carrying its hint.
  While enabled it renders a labelled `role="group"` with the Auto row and every translation option
  (`role="menuitemradio"`), using the same badges, `In use` pill, and disabled reasons as source
  rows. Toggling the switch leaves the menu open so the rows can appear/disappear; picking a
  translation row or Auto closes it.
- Source selection closes the menu; preference changes and Reload leave it open.
- Keyboard: Enter/Space/ArrowDown on the chip opens and focuses the first enabled item;
  ArrowUp/ArrowDown wrap over enabled items, Home/End jump, Enter/Space activate, Escape closes and
  returns focus to the chip, and Tab closes. The translation switch and enabled translation rows are
  part of the same navigation ring; disabled rows are skipped. Escape is consumed while the menu is
  open so it does not also close Now Playing or clear search. Opening a context menu closes this
  popover, so at most one floating menu is open at a time.
- A capture-phase pointerdown listener closes the popover on outside clicks.

`src/renderer/ui/lyricSourceMenuView.ts` builds the popover body (title, source rows, badges,
preference group, Translation section, Reload) from the model. It is stateless; the component owns
events, focus, and open/close state.

## Quick translation pill (`src/renderer/ui/translationToggle.ts`)

- Constructed with a container and `{ onToggle(enabled) }`; `update(model)` sets the label,
  `aria-pressed`, disabled state, `title`, and accessible label from the model.
- It knows nothing about the controller and reports the next pressed state on click.
- It sits next to the lyric source chip in the Now Playing header; the pressed state uses the
  accent color.

Visual rules for the chip, popover, rows, badges, translation section, and quick toggle are owned by
[renderer/styles.md](styles.md). The keyboard map and accessibility summary are in
[renderer/ui-map.md](ui-map.md). The controller state consumed by these models is owned by
[renderer/lyrics-controller.md](lyrics-controller.md).
