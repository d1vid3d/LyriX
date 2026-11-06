# Lyric View: DOM, Synchronization, Scroll, and Seek

**Purpose:** how a `LyricDocument` becomes lyric DOM and how each animation frame maps the playback
position to line/segment state, auto-scroll, and click-to-seek.

**Owning source paths:** `src/renderer/ui/lyricView.ts`.

**Last verified:** 2026-11-06 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md) (invariants 9 and 10),
[shared-lyric-core.md](../shared-lyric-core.md),
[renderer/lyrics-controller.md](lyrics-controller.md), [renderer/styles.md](styles.md),
[performance.md](../performance.md).

## DOM construction (once per document instance)

- One `.lyric-line` div per line with `data-index`.
- `data-agent` is set only when the line has an agent label.
- Timed documents add `.lyric-line--seekable`, `tabindex="0"`, and `role="button"`.
- Lines with segments build `.lyric-word` containers (nowrap) containing `.lyric-seg` spans with
  `data-segment-index`; lines without segments set `textContent` directly.
- When a translation key is active and a line has non-empty text for it, a `div.lyric-translation`
  is appended as the **last** child of that line. Lines without a translation get no element. The
  translation is plain line-level text, never word-split; `lang` is set only when the selected
  option's variant matches `/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/i`.
- Plain documents add `.lyric-lines--static` and no click/seek behavior.

## Synchronization

- `start()`/`stop()` control a single `requestAnimationFrame` loop.
- Each frame reads `engine.getPosition()` and computes:
  - primary line via `findActiveLineIndex`,
  - active set via `findActiveLineIndexes`,
  - active segment via `findActiveSegmentIndex`.
- Line classes toggled only when flags change: `lyric-line--current`, `--active`, `--past`,
  `--upcoming`, `--ended` (primary line whose end has passed).
- Segment classes toggled only when flags change: `lyric-seg--sung`, `--active`, `--upcoming`.
- The active segment gets `--progress` from `segmentProgress`; the previous active element's
  `--progress` is removed. Segment state is cleared when a line leaves the active set.
- Translation state is inherited through ancestor line classes only; JavaScript never toggles
  classes or styles on `.lyric-translation`.
- The current line is centered with smooth scrolling when the primary line changes.
- A rebuild caused by toggling translation or switching the translation source on the same track
  centers the current line immediately (no smooth animation, no jump to the top). Track changes keep
  their existing behavior.
- Manual wheel/touch/drag pauses auto-centering for **4 seconds**; the pending target is applied after
  the pause.
- Clicking a timed line (or pressing Enter/Space on it) seeks to `line.start`; it does not change
  play/pause.
- `destroy()` cancels the frame, removes listeners, and clears the DOM.

The search functions and progress clamps used here are owned by
[shared-lyric-core.md](../shared-lyric-core.md). The controller that supplies the document and
translation key is owned by [renderer/lyrics-controller.md](lyrics-controller.md). The visual rules
for the classes and the `--progress` gradient are owned by [renderer/styles.md](styles.md).

JavaScript never sets inline visual styles here except the `--progress` custom property; structural
inline styles elsewhere are owned by the virtual list and layout code
([renderer/library-query-and-lists.md](library-query-and-lists.md)).
