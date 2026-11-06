# Lyrics Controller and Word Grouping

**Purpose:** on-demand lyric source fetching, parsing, selection, translation state, caching, and
pure word grouping for the lyric view.

**Owning source paths:** `src/renderer/lyrics/lyricsController.ts`,
`src/renderer/lyrics/segmentGroups.ts`, `src/renderer/lyrics/translationState.ts`.

**Last verified:** 2026-11-06 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md) (invariants 4, 5, 9),
[shared-lyric-core.md](../shared-lyric-core.md), [main/lyric-sources.md](../main/lyric-sources.md),
[renderer/lyric-view.md](lyric-view.md), [renderer/lyric-source-menu.md](lyric-source-menu.md).

## Controller (`src/renderer/lyrics/lyricsController.ts`)

No DOM, Electron, or filesystem references. Constructed with explicit dependencies:

```ts
{
  fetchSources(trackId), saveChoice(trackId, sourceId), savePreference(preference),
  saveTranslationChoice(trackId, sourceId), saveTranslationSettings({ enabled, language }),
  preference, translationEnabled, translationLanguage, cacheLimit?
}
```

State:

```ts
{
  status: 'loading' | 'ready' | 'none',
  doc: LyricDocument | null,
  trackId: string | null,
  sources: Array<{
    option: LyricSourceOption,
    doc: LyricDocument | null,
    format: LyricFormat | null,
    lineCount: number,
    warningCount: number,
    usable: boolean
  }>,
  selectedId: string | null,
  mode: 'auto' | 'saved' | null,
  preference: LyricPreference,
  expectedSidecarName: string,
  translation: {
    enabled: boolean,
    language: string | null,
    selectedId: string | null,
    mode: 'auto' | 'saved' | null,
    key: string | null,
    available: boolean,
    options: Array<{
      option: LyricSourceOption,
      eligible: boolean,
      reason: 'primary' | 'unavailable' | 'unusable' | null,
      report: AlignmentReport | null
    }>
  }
}
```

Behavior:

- `setTrack(id)` ignores a repeated id; `null` clears state.
- Cache hit (including cached “none”) returns immediately and refreshes LRU order.
- Otherwise emits `loading`, fetches `LyricSources`, and parses every available option with
  `parseLyrics`. An entry is usable only when it produces at least one line.
- Selection uses the pure `selectLyricSource` with an `isUsable` predicate backed by those parsed
  entries. `mode` is `"saved"` when the persisted per-track choice won and `"auto"` otherwise.
- `status` is `"none"` when nothing is usable, but `sources` still exposes every option.
- `selectSource(id)` switches immediately from the current entries without refetching and persists
  the choice. `selectSource(null)` clears the choice and returns to auto. Unavailable or unusable
  ids are ignored.
- `setPreference(pref)` persists the preference and recomputes the current track. Startup settings
  application passes `{ persist: false }`.
- Translation state is derived by the pure `buildTranslation` helper in `translationState.ts` on
  every recompute; only parsed source entries are cached. Eligible options are available, usable,
  and not the current primary; each carries its alignment report.
- `state.doc` is the primary document with `attachTranslation` applied (key = translation option id)
  only when translation is enabled and a translation is selected. Otherwise it is exactly the plain
  primary document. `key` is null while nothing is attached. The derived instance is memoized by
  primary-document identity + translation key, so unchanged recomputations keep the same `state.doc`
  and the lyric view does not rebuild its DOM.
- `setTranslationEnabled(enabled)` persists through `saveTranslationSettings` and recomputes.
  `applyTranslationSettings({ enabled, language })` applies both fields; startup uses
  `{ persist: false }`.
- `selectTranslation(id)` accepts only an eligible id, persists the per-track choice, and updates the
  sticky language (plus settings) when the option has a `variant`. `selectTranslation(null)` clears
  the per-track choice and returns to auto; neither changes `enabled`. A saved translation that
  becomes ineligible (for example it is now the primary) is kept and treated as auto.
- Translation selection is recomputed whenever the primary source changes, on reload, and on a new
  track.
- `reload()` bypasses the cache, refetches the current track, and keeps both saved choices so an
  edited sidecar is picked up.
- `clearCacheAndReload()` drops every cached entry, then refetches the current track while preserving
  both saved choices. The library controller calls it after a rescan or `library:updated`, so changed
  tags and sidecars are picked up without clearing a manual selection.
- Each fetch captures a generation; a response is applied only if the generation is still current,
  so slow responses for a previous track are ignored.
- Caches whole parsed source entries (including “none”), up to **10**, evicting the least recently
  used.
- `subscribe(listener)` adds a listener, immediately emits the current state, and returns an
  unsubscribe function.
- Fetch/parse errors are logged and cached as `none`. Options and the selection are logged with
  `console.debug` once per fetched track; translation changes log the selected id, mode, and
  alignment report once.

The shared parser, alignment, and selection rules behind these steps are owned by
[shared-lyric-core.md](../shared-lyric-core.md). The source list and ids come from
[main/lyric-sources.md](../main/lyric-sources.md). Persistence of both choices is owned by
[persistence.md](../persistence.md).

## Pure word grouping (`src/renderer/lyrics/segmentGroups.ts`)

`groupSegments(segments)` splits a line's segments into `LyricWordGroup` objects:

- Consecutive segments stay in one group until a segment with `spaceAfter: true` closes it.
- A trailing group without whitespace is still emitted.
- The renderer inserts one literal space between groups, so syllables inside a word never wrap.

The DOM consumer of these groups is owned by [renderer/lyric-view.md](lyric-view.md). The translation
view model (eligibility, reasons, badges) is owned by
[renderer/lyric-source-menu.md](lyric-source-menu.md).
