# Security and Robustness

**Purpose:** the isolation, containment, validation, and failure-isolation rules that keep a local
player predictable when inputs are malformed or files disappear.

**Owning source paths:** `src/main/media-protocol.ts`, `src/main/ipc.ts`, `src/main/reveal.ts`,
`src/main/pathContainment.ts`, `src/main/sessionValidation.ts`, `src/main/sessionStore.ts`,
`src/main/lyrics/`, `src/main/settings.ts`, `src/main/cache.ts`, `src/main/json-file.ts`,
`src/preload/index.ts`, `src/renderer/index.html`.

**Last verified:** 2026-11-08 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](TechnicalSpecs.md) (invariants),
[main/covers-and-media.md](main/covers-and-media.md), [main/library-scanning.md](main/library-scanning.md),
[main/lifecycle-and-ipc.md](main/lifecycle-and-ipc.md), [persistence.md](persistence.md).

- **Context isolation + sandbox + no Node integration** in the renderer.
- **CSP** restricts scripts to self, styles to self/inline, images to self/data/media, and media to
  self/media.
- **No renderer paths**: ids only; main resolves and validates.
- **Session payloads are id-only and validated**: `session:save-queue` accepts only versioned,
  capped queue state with 40-hex track ids and bounded strings; `session:save-position` requires a
  finite non-negative position and a matching queue entry; the session is discarded when its folder
  no longer matches. Window state is machine-local and independent of the library.
- **Path containment** in `media://` uses `realpath` on both the file and the root, then
  `isPathInside`.
- **Reveal never trusts a renderer path**: `library:reveal-track` takes only a track id, resolves the
  path from the scanned library, re-runs `realpath` on both the file and the root,
  `isRevealPathAllowed` requires a strict descendant with a `.flac` extension, and the canonical path
  must be a regular file before `shell.showItemInFolder`. Errors resolve to `false`.
- **Symlinks are skipped** during scanning and sidecar discovery, preventing cycles and escapes.
- **Only `.flac` regular files** are served; sidecar reads accept only regular files in the track's
  own directory and enforce the size cap owned by [main/lyric-sources.md](main/lyric-sources.md).
- **IPC input validation**: track ids must be 40-character lowercase SHA-1 hex strings; volume is
  clamped; UI state is normalized; malformed lyric ids return `null`; lyric and translation choice
  ids must be `embedded` or `sidecar:<file name>` with no path separators; preferences accept only
  known values; translation settings require a boolean and a language matching
  `/^[A-Za-z0-9_-]{1,32}$/` (or null).
- **No sidecar paths cross IPC**: `LyricSourceOption.detail`, ids, and variants carry file names
  only.
- **Tolerant persistence**: bad JSON, wrong cache/choice versions, and malformed entries degrade to
  defaults instead of crashing; translation alignment is pure and never throws on mismatched counts.
- **Atomic writes** avoid partially written settings/cache/choice/cover files.
- **Cancellable scans** prevent stale results from overwriting newer libraries.
- **Stale async responses** are ignored in both the scan coordinator and the lyric controller.
- **Playback failure isolation**: one unreadable track is logged and skipped, not fatal.
- **Image fallbacks**: failed covers hide the `<img>` and show the `♪` placeholder.

The exact id shape and hashing rules are owned by [data-model.md](data-model.md). The exact
normalization/default rules for settings and lyric choices are owned by
[persistence.md](persistence.md). The sidecar file rules are owned by
[main/lyric-sources.md](main/lyric-sources.md), and the `media://` response rules by
[main/covers-and-media.md](main/covers-and-media.md).

The security flags and CSP string are configured in `src/main/window.ts` and
`src/renderer/index.html`; the build-time view is in [build-and-config.md](build-and-config.md).
