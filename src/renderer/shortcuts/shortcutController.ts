import { chordMatches, isModifierChord, matchShortcut } from './shortcutRegistry'
import type {
  KeyDescriptor,
  ShortcutContext,
  ShortcutDefinition
} from './shortcutRegistry'
import { shouldIgnoreShortcut } from './typingGuard'
import type { FocusDescriptor } from './typingGuard'
import type { EscapeLayerStack } from './layerStack'

export interface ShortcutControllerDeps {
  definitions: readonly ShortcutDefinition[]
  commands: Record<string, () => void>
  layers: EscapeLayerStack
  context(): ShortcutContext
  isMac: boolean
}

/**
 * The single global keydown listener. Escape goes through the layer stack; every other key goes
 * through the registry and only calls `preventDefault` when a command actually ran.
 */
export class ShortcutController {
  private readonly deps: ShortcutControllerDeps

  constructor(deps: ShortcutControllerDeps) {
    this.deps = deps
  }

  start(): () => void {
    window.addEventListener('keydown', this.handleKeydown)
    return () => window.removeEventListener('keydown', this.handleKeydown)
  }

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.isComposing) return

    if (event.key === 'Escape') {
      if (this.deps.layers.closeTop()) {
        event.preventDefault()
        event.stopPropagation()
      }
      return
    }

    const context = this.deps.context()
    if (context.shortcutsOverlayOpen) return

    const descriptor: KeyDescriptor = {
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey
    }
    const definition = matchShortcut(this.deps.definitions, descriptor, context, {
      isMac: this.deps.isMac
    })
    if (!definition) return

    const chord = definition.keys.find((candidate) =>
      chordMatches(candidate, descriptor, this.deps.isMac)
    )
    if (!chord) return

    if (
      shouldIgnoreShortcut(chord, focusDescriptor(event.target), this.deps.isMac)
    ) {
      return
    }

    // Plain keys stay out of open floating menus; modified keys (Ctrl+F, Ctrl+L) still work.
    if (
      !isModifierChord(chord, this.deps.isMac) &&
      (context.contextMenuOpen || context.sourceMenuOpen)
    ) {
      return
    }

    const command = this.deps.commands[definition.id]
    if (!command) return

    event.preventDefault()
    command()
  }
}

function focusDescriptor(target: EventTarget | null): FocusDescriptor {
  if (!(target instanceof HTMLElement)) {
    return { tagName: '', type: '', isContentEditable: false, role: null }
  }

  const roleElement = target.closest('[role]')
  return {
    tagName: target.tagName,
    type: target instanceof HTMLInputElement ? target.type : '',
    isContentEditable: target.isContentEditable,
    role: roleElement?.getAttribute('role') ?? null
  }
}
