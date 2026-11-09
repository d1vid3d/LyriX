# Keyboard Shortcuts, Escape Layers, Overlay, and Media Session

**Purpose:** the declarative shortcut registry and its single keydown listener, the Escape layer
stack, the generated shortcuts dialog, and the renderer's Media Session integration.

**Owning source paths:** `src/renderer/shortcuts/shortcutRegistry.ts`,
`src/renderer/shortcuts/defaultShortcuts.ts`, `src/renderer/shortcuts/typingGuard.ts`,
`src/renderer/shortcuts/layerStack.ts`, `src/renderer/shortcuts/shortcutCommands.ts`,
`src/renderer/shortcuts/shortcutController.ts`, `src/renderer/shortcuts/overlayModel.ts`,
`src/renderer/ui/shortcutOverlay.ts`, `src/renderer/styles/shortcutOverlay.css`,
`src/renderer/src/shellFeatures.ts`, `src/renderer/session/`, `src/renderer/media/`.

**Last verified:** 2026-11-08 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](../TechnicalSpecs.md) (invariant 12),
[renderer/ui-map.md](ui-map.md), [renderer/playback.md](playback.md),
[renderer/queue-panel.md](queue-panel.md), [renderer/favorites.md](favorites.md),
[renderer/context-menu-and-toasts.md](context-menu-and-toasts.md),
[main/window-and-session.md](../main/window-and-session.md).

## Definition type (`shortcutRegistry.ts`)

```ts
interface KeyChord {
  key: string   // 'Space', 'ArrowRight', '?', '/', or a lowercase letter
  mod?: boolean // Ctrl on Windows/Linux, Cmd on macOS
  ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean
}

interface ShortcutDefinition {
  id: string
  label: string
  category: string
  keys: readonly KeyChord[]
  scope?: string // defaults to 'global'
  when?(context: ShortcutContext): boolean
}

interface ShortcutContext {
  isNowPlayingOpen: boolean
  translationAvailable: boolean
  contextMenuOpen: boolean
  sourceMenuOpen: boolean
  shortcutsOverlayOpen: boolean
}
```

Matching is exact on all four modifiers, with `mod` expanded per platform. `Ctrl+ArrowRight` never
matches a plain `ArrowRight`. Matching considers `global` definitions plus the active scope and
honors `when()`. `findShortcutConflicts` reports any two definitions sharing a chord in the same
scope; the default table is conflict-free on both platforms.

`typingGuard.ts` (pure) blocks plain-key shortcuts (no Ctrl/Cmd/Alt) when focus is in a text input,
textarea, select, contenteditable, or range input. For Space/Enter it also defers to native
activation on buttons, links, and `menuitem`/`option`/`switch`/`checkbox`/`radio` roles. Modified
shortcuts keep working while typing.

## Default table (`defaultShortcuts.ts`)

| Command | Keys | Category |
| --- | --- | --- |
| Play / pause | Space | Playback |
| Next track | N, Ctrl/Cmd+→ | Navigation |
| Previous track (restarts after 3 s) | P, Ctrl/Cmd+← | Navigation |
| Seek back 10 s | J | Navigation |
| Seek forward 10 s | L | Navigation |
| Volume up/down 5% | Ctrl/Cmd+↑ / Ctrl/Cmd+↓ | Playback |
| Toggle shuffle | S | Playback |
| Cycle repeat | R | Playback |
| Toggle queue panel | Q (not while a floating menu is open) | Queue |
| Focus search | Ctrl/Cmd+F, `/` | Search |
| Toggle Now Playing | Ctrl/Cmd+L | View |
| Toggle translation | T (Now Playing open and translation available) | View |
| Toggle current track favorite | F | Favorites |
| Show keyboard shortcuts | ? | Help |

The table is declared once and can later be layered with user overrides; no customization UI exists.

## Controller (`shortcutController.ts`)

One `window` keydown listener:

1. Escape goes to the layer stack; it prevents the default only when a layer actually closed.
2. While the shortcuts overlay is open, other commands are ignored.
3. The event is matched against the registry. The typing guard runs against the event target.
4. Plain-key commands are ignored while a context or source menu is open; Ctrl/Cmd commands are not.
5. `preventDefault()` is called only when a command runs.

`shortcutCommands.ts` maps command ids to explicitly injected transport/queue/navigation/UI
handlers. Component-local keys (menu arrow navigation, queue-row Alt+Arrow/Delete/Enter, drag
cancellation, in-input editing) stay in their components. The old toolbar keydown handler was
removed; Ctrl+F, `/`, Q, and the Escape chain now live here.

## Escape layer stack (`layerStack.ts`)

```ts
interface EscapeLayer {
  id: string
  priority: number
  isOpen(): boolean
  close(): void
}

class EscapeLayerStack {
  register(layer): () => void
  closeTop(): boolean // closes exactly the highest-priority open layer
  openLayerIds(): string[]
}
```

Priorities, highest first: `contextMenu` 60, `dataDisclaimer` 55, `shortcutsOverlay` 50,
`lyricSourceMenu` 40, `queuePanel` 30, `nowPlaying` 20, `searchClear` 10. Later registrations win
ties. `shellFeatures.ts` registers the owners; the context menu and source menu no longer close on
Escape themselves, so behavior (including focus restore) matches the previous chain exactly.

## Help overlay (`ui/shortcutOverlay.ts`, `overlayModel.ts`)

The overlay is generated from the registry, never hand-written. `buildShortcutOverlayModel` groups
definitions by category in table order and formats chords with platform labels (`Ctrl`/`Cmd`, arrow
glyphs, `Space`). The dialog is `role="dialog"` with `aria-modal="true"`, a labelled title, and a
close button. It opens with `?` or the toolbar `?` button, traps Tab inside the dialog, closes on the
backdrop or Escape (through the layer stack), and returns focus to the opener. CSS variables live at
the top of `styles/shortcutOverlay.css`.

## Session tracking (`src/renderer/session/`)

`sessionTiming.ts` is pure: time updates send at most every 5 s, while pause, ended, seek, track
change, and flush always send. `SessionController` subscribes to the queue and `PlaybackEngine`,
debounces queue payloads by 1 s, sends position 0 on a track change, and exposes `noteSeek()` and
`flush()`. It stays idle until `start()` runs after session restore, so restore can never write the
loaded session back over itself. Main-side files, validation, and the restore flow are owned by
[main/window-and-session.md](../main/window-and-session.md).

## Media Session (`src/renderer/media/`)

`buildMediaMetadata(track, coverUrl)` is pure and emits title/artist/album plus the existing full and
`?size=small` cover URLs. `mapMediaAction(action, details)` is pure and maps play, pause,
previoustrack, nexttrack, seekbackward, seekforward, seekto, and stop to transport commands
(default seek step 10 s; invalid `seekto` is ignored).

`MediaSessionController` feature-detects `navigator.mediaSession`, guards every API call, publishes
metadata and playback state, and updates position on track change, loaded metadata, play/pause, and
seek end (not every frame). It registers action handlers only in `media-session` mode; in
`global-shortcuts` mode it listens to IPC-forwarded media keys instead. The chosen mechanism and the
manual verification note are owned by [main/window-and-session.md](../main/window-and-session.md).
