import { formatChord } from './shortcutRegistry'
import type { ShortcutDefinition } from './shortcutRegistry'

export interface ShortcutOverlayRow {
  id: string
  label: string
  chords: string[]
}

export interface ShortcutOverlayGroup {
  category: string
  rows: ShortcutOverlayRow[]
}

/**
 * Builds the help-overlay model from the registry, grouped in table order. Labels are generated
 * from the same definitions that drive matching, so the overlay cannot drift from the shortcuts.
 */
export function buildShortcutOverlayModel(
  definitions: readonly ShortcutDefinition[],
  options: { isMac: boolean }
): ShortcutOverlayGroup[] {
  const groups = new Map<string, ShortcutOverlayRow[]>()

  for (const definition of definitions) {
    const chords = definition.keys.map((chord) => formatChord(chord, options.isMac))
    const rows = groups.get(definition.category) ?? []
    rows.push({ id: definition.id, label: definition.label, chords })
    groups.set(definition.category, rows)
  }

  return [...groups.entries()].map(([category, rows]) => ({ category, rows }))
}
