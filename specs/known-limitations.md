# Known Limitations and Non-Goals

**Purpose:** current scope boundaries and deliberate omissions, so an agent does not “fix” something
that is intentionally out of scope.

**Owning source paths:** cross-cutting; see linked specs for the implemented behavior.

**Last verified:** 2026-11-08 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](TechnicalSpecs.md), [shared-lyric-core.md](shared-lyric-core.md),
[main/lyric-sources.md](main/lyric-sources.md), [renderer/lyrics-controller.md](renderer/lyrics-controller.md),
[renderer/queue-panel.md](renderer/queue-panel.md),
[renderer/context-menu-and-toasts.md](renderer/context-menu-and-toasts.md),
[build-and-config.md](build-and-config.md).

## Non-goals (current scope)

Gapless playback, crossfade, queue undo, queue multi-select, saving the queue as a playlist,
context-menu submenus, dragging tracks from the library into the queue, a global shortcut registry,
media-key integration, resume/gapless session restore, queue contents persistence, fuzzy search,
search history, filters, artist images, multi-artist splitting, genres, grid/artist virtualization,
online lyric or translation lookup, singer-specific styling, translation editing, swapping
original/translation, side-by-side translation layout, word-level translation timing, per-language
fonts, translation keyboard shortcuts, TTML, tag editing, packaging.

## Limitations

- Lyric line ends are estimated when the file does not provide them (capped at 10 s; final line 5 s).
- Word-level progress exists only for enhanced LRC with inline markers.
- Singer labels (`v1:`) are parsed into `agent` and exposed as `data-agent`, but not styled or shown
  as separate voices.
- Translations are aligned and attached to lyric lines (time/index/partial/none) and rendered as
  plain line-level text under each line, chosen through the Translation section or the quick toggle.
  There is no translation editing/writing, no word-level translation timing, no swapping of
  original/translation, no side-by-side layout, no per-language fonts, no translation keyboard
  shortcut, and no online translation lookup. TTML is typed/reserved but not parsed.
- Plain lyrics are static: no highlighting and no click-to-seek.
- Sidecars are limited to the track's own directory and the `<base>.lrc` / `<base>.<variant>.lrc`
  names. The size cap, symlink/directory skips, and accepted encodings are owned by
  [main/lyric-sources.md](main/lyric-sources.md).
- No online lookup, lyric editing, sidecar writing, or tag writing.
- No gapless playback, crossfade, media-key integration, or queue-contents persistence. Shuffle and
  repeat modes are persisted; the current queue is rebuilt from the library on launch. The queue
  panel supports remove, clear, move, and jump, but not undo, multi-select, or saving the queue as a
  playlist, and context menus have no submenus.
- No packaging/distribution configuration.

  UNVERIFIED/POSSIBLY STALE: `package.json` defines `npm run package` and `npm run make`, and
  `forge.config.js` configures an asar package with a Squirrel maker. Either that configuration is
  intentionally unfinished, or this limitation predates it. See
  [build-and-config.md](build-and-config.md).

- Album/artist grids are not virtualized.
- Search is exact-word substring matching, not fuzzy.
- Multi-artist strings are not split; they remain one artist key.

The parsing behavior behind the timing estimates is owned by [shared-lyric-core.md](shared-lyric-core.md);
the sidecar name/size rules by [main/lyric-sources.md](main/lyric-sources.md); the translation
selection and display rules by [renderer/lyrics-controller.md](renderer/lyrics-controller.md) and
[renderer/lyric-view.md](renderer/lyric-view.md).
