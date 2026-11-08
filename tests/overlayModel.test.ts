import { describe, expect, it } from 'vitest'
import { buildShortcutOverlayModel } from '../src/renderer/shortcuts/overlayModel'
import type { ShortcutDefinition } from '../src/renderer/shortcuts/shortcutRegistry'

const definitions: readonly ShortcutDefinition[] = [
  {
    id: 'play',
    label: 'Play / pause',
    category: 'Playback',
    keys: [{ key: 'Space' }]
  },
  {
    id: 'next',
    label: 'Next track',
    category: 'Navigation',
    keys: [{ key: 'n' }, { key: 'ArrowRight', mod: true }]
  },
  {
    id: 'shuffle',
    label: 'Toggle shuffle',
    category: 'Playback',
    keys: [{ key: 's' }]
  }
]

describe('buildShortcutOverlayModel', () => {
  it('groups rows by category in first-appearance order', () => {
    const model = buildShortcutOverlayModel(definitions, { isMac: false })
    expect(model.map((group) => group.category)).toEqual(['Playback', 'Navigation'])
    expect(model[0].rows.map((row) => row.id)).toEqual(['play', 'shuffle'])
  })

  it('formats multiple chords for the active platform', () => {
    const model = buildShortcutOverlayModel(definitions, { isMac: true })
    const next = model[1].rows[0]
    expect(next.chords).toEqual(['N', 'Cmd+→'])
  })

  it('uses Ctrl labels off macOS', () => {
    const model = buildShortcutOverlayModel(definitions, { isMac: false })
    expect(model[1].rows[0].chords).toEqual(['N', 'Ctrl+→'])
  })
})
