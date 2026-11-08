/** Pure shortcut definitions, chord matching, conflict detection, and key-label formatting. */

export interface KeyChord {
  /** Normalized key: `'Space'`, `'ArrowRight'`, `'Escape'`, `'?'`, or a lowercase letter. */
  key: string
  /** Ctrl on Windows/Linux, Cmd on macOS. */
  mod?: boolean
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  meta?: boolean
}

export interface KeyDescriptor {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export interface ShortcutContext {
  isNowPlayingOpen: boolean
  translationAvailable: boolean
  contextMenuOpen: boolean
  sourceMenuOpen: boolean
  shortcutsOverlayOpen: boolean
}

export interface ShortcutDefinition {
  id: string
  label: string
  category: string
  keys: readonly KeyChord[]
  /** Defaults to `global`; matching only considers the active scope plus global. */
  scope?: string
  when?(context: ShortcutContext): boolean
}

export interface ShortcutConflict {
  first: ShortcutDefinition
  second: ShortcutDefinition
  chord: string
}

interface ModifierState {
  ctrl: boolean
  meta: boolean
  alt: boolean
  shift: boolean
}

export function normalizeKey(key: string): string {
  if (key === ' ' || key === 'Spacebar') return 'Space'
  if (key === 'Esc') return 'Escape'
  return key.length === 1 ? key.toLowerCase() : key
}

function expectedModifiers(chord: KeyChord, isMac: boolean): ModifierState {
  return {
    ctrl: chord.ctrl === true || (chord.mod === true && !isMac),
    meta: chord.meta === true || (chord.mod === true && isMac),
    alt: chord.alt === true,
    shift: chord.shift === true
  }
}

export function isModifierChord(chord: KeyChord, isMac: boolean): boolean {
  const expected = expectedModifiers(chord, isMac)
  return expected.ctrl || expected.meta || expected.alt
}

/** Exact modifier matching: Ctrl+ArrowRight never matches a plain ArrowRight. */
export function chordMatches(
  chord: KeyChord,
  descriptor: KeyDescriptor,
  isMac: boolean
): boolean {
  if (normalizeKey(chord.key) !== normalizeKey(descriptor.key)) return false

  const expected = expectedModifiers(chord, isMac)
  return (
    expected.ctrl === descriptor.ctrlKey &&
    expected.meta === descriptor.metaKey &&
    expected.alt === descriptor.altKey &&
    expected.shift === descriptor.shiftKey
  )
}

export function chordSignature(chord: KeyChord, isMac: boolean): string {
  const expected = expectedModifiers(chord, isMac)
  const modifiers = [
    expected.ctrl ? 'ctrl' : '',
    expected.meta ? 'meta' : '',
    expected.alt ? 'alt' : '',
    expected.shift ? 'shift' : ''
  ].filter(Boolean)
  return [...modifiers, normalizeKey(chord.key)].join('+')
}

/** Returns the matching definition (optionally restricted to a scope) or `null`. */
export function matchShortcut(
  definitions: readonly ShortcutDefinition[],
  descriptor: KeyDescriptor,
  context: ShortcutContext,
  options: { isMac: boolean; scope?: string }
): ShortcutDefinition | null {
  const scope = options.scope ?? 'global'

  for (const definition of definitions) {
    const definitionScope = definition.scope ?? 'global'
    if (definitionScope !== 'global' && definitionScope !== scope) continue
    if (definition.when && !definition.when(context)) continue
    if (definition.keys.some((chord) => chordMatches(chord, descriptor, options.isMac))) {
      return definition
    }
  }

  return null
}

/** Pairs of definitions that share a chord inside the same scope. */
export function findShortcutConflicts(
  definitions: readonly ShortcutDefinition[],
  isMac: boolean
): ShortcutConflict[] {
  const seen = new Map<string, ShortcutDefinition>()
  const conflicts: ShortcutConflict[] = []

  for (const definition of definitions) {
    const scope = definition.scope ?? 'global'
    for (const chord of definition.keys) {
      const signature = `${scope}:${chordSignature(chord, isMac)}`
      const previous = seen.get(signature)
      if (previous) {
        conflicts.push({ first: previous, second: definition, chord: signature })
      } else {
        seen.set(signature, definition)
      }
    }
  }

  return conflicts
}

const KEY_LABELS: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Space: 'Space',
  Escape: 'Esc',
  Enter: 'Enter'
}

/** Platform-aware label such as `Ctrl+→` or `Cmd+L`. */
export function formatChord(chord: KeyChord, isMac: boolean): string {
  const expected = expectedModifiers(chord, isMac)
  const parts: string[] = []

  if (chord.mod) parts.push(isMac ? 'Cmd' : 'Ctrl')
  else if (expected.ctrl) parts.push('Ctrl')
  if (chord.meta && !chord.mod) parts.push(isMac ? 'Cmd' : 'Meta')
  if (expected.alt) parts.push('Alt')
  if (expected.shift) parts.push('Shift')

  const key = normalizeKey(chord.key)
  const label = KEY_LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key)
  parts.push(label)
  return parts.join('+')
}
