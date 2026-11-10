# Play History

**Purpose:** the opt-in, append-only play log in `<library>/LyrixData`, its tolerant parser and
aggregation, the recording status, and the history IPC.

**Owning source paths:** `src/main/lyrixdata/historyLog.ts`,
`src/main/lyrixdata/historyStore.ts`, `src/main/lyrixdata/historyIpc.ts`,
`src/main/lyrixdata/lyrixDataStore.ts`, `src/main/lyrixdata/formats.ts`, `src/main/ipc.ts`,
`src/renderer/history/playTracker.ts`, `src/renderer/src/transport.ts`.

**Last verified:** 2026-11-10 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md) (invariants 2, 6, 8, 13),
[main/lyrixdata.md](lyrixdata.md), [persistence.md](../persistence.md),
[renderer/history.md](../renderer/history.md), [renderer/playback.md](../renderer/playback.md).

## Format (`LyrixData/history.jsonl`)

One JSON object per line, append-only:

```json
{ "v": 1, "ref": { "path": "...", "fp": { "title": "...", "artist": "...", "album": "...", "durationSec": 0 } }, "at": 1234567890, "m": "<machineId>" }
```

- `at` is stamped by main, never accepted from the renderer.
- Every line is complete (`\n` terminated). `appendLine` refuses embedded newlines.
- Reads parse at most the last 10 MB and ignore a partial trailing line, so a crash cannot break
  reading. Unknown-version and malformed lines are skipped but never deleted.
- Growth is about 200 bytes per play. Compaction/rotation is out of scope; clearing is the only
  rewrite.

`library.json` gains an optional `historyRecording: boolean`. A missing flag uses the single named
`DEFAULT_HISTORY_RECORDING = false`; only `true` enables recording. Rewriting the flag preserves all
unknown fields through the versioned store.

## Opt-in and creation rules

- No history file is created while recording is off. Scanning, browsing, opening, and playing with
  recording off never create or append to LyrixData.
- `history:set-recording(true)` is the only history operation allowed to create LyrixData (through
  `ensureCreated`). Turning recording off on a not-created library is a no-op.
- `record(trackId)` ignores everything unless recording is enabled. A failed append is dropped (not
  buffered) and marks the store blocked.

## Parser and aggregation (`historyLog.ts`)

`parseHistoryText` validates version, ref shape, timestamp, and machine id. `aggregateHistory`:

1. resolves every record through `resolveTrackRef` against the current `TrackRefIndex`;
2. drops missing refs (found and relinked both count);
3. groups by resolved track id as `{ trackId, lastPlayedAt, playCount }`, taking the newest `at` and
   counting records; relinked old paths therefore merge into the same track;
4. sorts by `lastPlayedAt` descending, then play count, then track id, and limits (default 500, max
   5000).

The last resolved record is also used for the 5 s double-count guard: a record for the same track
within 5 s of the previous one is ignored.

## Store and status (`historyStore.ts`)

`getState()` returns the last resolved state; `read({ limit })` rebuilds it for `history:get`.
The snapshot is bound through `setLibrary(root, albums)`, which rebuilds the ref index, re-resolves
records, and emits immediately. The state shape is:

```ts
{
  recent: [{ trackId, lastPlayedAt, playCount }],
  recording: {
    enabled: boolean,
    status: 'off' | 'recording' | 'not-created' | 'blocked',
    reason: null | 'read-only' | 'unavailable' | 'newer-version'
  }
}
```

- `off`: the flag is false in a created/ready library.
- `recording`: the flag is true and the store is writable.
- `not-created`: no LyrixData/library flag yet.
- `blocked`: recording is expected but the store is read-only, unavailable, or newer-version.

`record(trackId)` resolves the id through the current snapshot, applies the 5 s guard, appends a line
through the store's serialized queue, and schedules a debounced (~300 ms) `history:changed` push.
`setRecording(enabled)` writes the library flag; `clear()` atomically replaces `history.jsonl` with
an empty file and leaves `library.json` untouched. Library snapshot changes rebuild the ref index,
re-resolve records, and emit immediately.

## Play counting (renderer)

`PlayTracker` (DOM-free, all clocks injected) starts an instance when playback starts or the entry
changes, accumulates listened time only on playing ticks, caps each tick delta at 2 s, ignores pause
gaps and seeking, and counts once per instance at
`min(30 s, 50% of duration)` (30 s when duration is unknown). Track changes, failures, and ending
finish the instance; a repeat-one restart or replay after ending starts a new instance, and a
different queue entry for the same track is also a new instance. A restored session never counts
until actual playback starts. Transport wires this through engine events only
(`play`, `pause`, `timeupdate`, `ended`, `error`) and never reads the `<audio>` element directly.

## IPC

| Channel | Input | Output |
| --- | --- | --- |
| `history:get` | `{ limit?: number }` | `HistoryState` |
| `history:record` | `trackId: unknown` | `{ ok: boolean }` |
| `history:set-recording` | `enabled: unknown` | `{ ok: true, state } \| { ok: false, reason }` |
| `history:clear` | — | same result shape |

Limits are clamped to 1..5000, track ids must be 40-hex, and booleans are required. Every handler
catches errors and never throws across the boundary. Events: `history:changed` (debounced by the
store). No paths cross IPC.
