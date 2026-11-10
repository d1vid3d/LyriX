import { describe, expect, it } from 'vitest'
import { DEFAULT_SHORTCUTS } from '../src/renderer/shortcuts/defaultShortcuts'
import {
  chordMatches,
  findShortcutConflicts,
  formatChord,
  matchShortcut
} from '../src/renderer/shortcuts/shortcutRegistry'
import type { KeyDescriptor, ShortcutContext } from '../src/renderer/shortcuts/shortcutRegistry'
import { isTypingTarget, shouldIgnoreShortcut } from '../src/renderer/shortcuts/typingGuard'
import type { FocusDescriptor } from '../src/renderer/shortcuts/typingGuard'

const context: ShortcutContext = {
  isNowPlayingOpen: false,
  translationAvailable: false,
  contextMenuOpen: false,
  sourceMenuOpen: false,
  shortcutsOverlayOpen: false
}

function key(keyValue: string, modifiers: Partial<KeyDescriptor> = {}): KeyDescriptor {
  return {
    key: keyValue,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers
  }
}

function target(overrides: Partial<FocusDescriptor> = {}): FocusDescriptor {
  return {
    tagName: 'DIV',
    type: '',
    isContentEditable: false,
    role: null,
    ...overrides
  }
}

describe('chord matching', () => {
  it('requires exact modifiers', () => {
    expect(
      chordMatches({ key: 'ArrowRight', mod: true }, key('ArrowRight', { ctrlKey: true }), false)
    ).toBe(true)
    expect(chordMatches({ key: 'ArrowRight' }, key('ArrowRight', { ctrlKey: true }), false)).toBe(
      false
    )
    expect(chordMatches({ key: 'ArrowRight', mod: true }, key('ArrowRight'), false)).toBe(false)
    expect(chordMatches({ key: 'f', mod: true }, key('f', { shiftKey: true }), false)).toBe(false)
  })

  it('maps mod to Ctrl on Windows/Linux and Cmd on macOS', () => {
    expect(chordMatches({ key: 'f', mod: true }, key('f', { ctrlKey: true }), false)).toBe(true)
    expect(chordMatches({ key: 'f', mod: true }, key('f', { metaKey: true }), false)).toBe(false)
    expect(chordMatches({ key: 'f', mod: true }, key('f', { metaKey: true }), true)).toBe(true)
    expect(chordMatches({ key: 'f', mod: true }, key('f', { ctrlKey: true }), true)).toBe(false)
  })

  it('normalizes Space and letter keys', () => {
    expect(chordMatches({ key: 'Space' }, key(' '), false)).toBe(true)
    expect(chordMatches({ key: 'n' }, key('N'), false)).toBe(true)
  })
})

describe('matchShortcut', () => {
  it('respects when() predicates', () => {
    expect(
      matchShortcut(DEFAULT_SHORTCUTS, key('t'), context, { isMac: false })?.id
    ).toBeUndefined()

    expect(
      matchShortcut(
        DEFAULT_SHORTCUTS,
        key('t'),
        { ...context, isNowPlayingOpen: true, translationAvailable: true },
        { isMac: false }
      )?.id
    ).toBe('toggleTranslation')
  })

  it('matches global and active scoped definitions only', () => {
    const scoped = [
      {
        id: 'global',
        label: 'Global',
        category: 'Test',
        keys: [{ key: 'g' }]
      },
      {
        id: 'onlyQueue',
        label: 'Queue',
        category: 'Test',
        scope: 'queue',
        keys: [{ key: 'x' }]
      }
    ]

    expect(matchShortcut(scoped, key('g'), context, { isMac: false })?.id).toBe('global')
    expect(matchShortcut(scoped, key('x'), context, { isMac: false })).toBeNull()
    expect(matchShortcut(scoped, key('x'), context, { isMac: false, scope: 'queue' })?.id).toBe(
      'onlyQueue'
    )
  })

  it('keeps the default table conflict-free on both platforms', () => {
    expect(findShortcutConflicts(DEFAULT_SHORTCUTS, false)).toEqual([])
    expect(findShortcutConflicts(DEFAULT_SHORTCUTS, true)).toEqual([])
    expect(matchShortcut(DEFAULT_SHORTCUTS, key('f'), context, { isMac: false })?.id).toBe(
      'toggleCurrentFavorite'
    )
  })

  it('detects conflicts within a scope and allows the same chord in another scope', () => {
    const definitions = [
      { id: 'a', label: 'A', category: 'Test', keys: [{ key: 'x' }] },
      { id: 'b', label: 'B', category: 'Test', keys: [{ key: 'x' }] },
      {
        id: 'c',
        label: 'C',
        category: 'Test',
        scope: 'queue',
        keys: [{ key: 'x' }]
      }
    ]
    expect(findShortcutConflicts(definitions, false)).toHaveLength(1)
  })
})

describe('formatChord', () => {
  it('uses platform labels and arrow glyphs', () => {
    expect(formatChord({ key: 'f', mod: true }, false)).toBe('Ctrl+F')
    expect(formatChord({ key: 'f', mod: true }, true)).toBe('Cmd+F')
    expect(formatChord({ key: 'ArrowRight', mod: true }, false)).toBe('Ctrl+→')
    expect(formatChord({ key: '?', shift: true }, false)).toBe('Shift+?')
    expect(formatChord({ key: 'Space' }, false)).toBe('Space')
  })
})

describe('typing guard', () => {
  it('blocks plain keys in text entry and range targets', () => {
    expect(isTypingTarget(target({ tagName: 'INPUT', type: 'search' }))).toBe(true)
    expect(isTypingTarget(target({ tagName: 'INPUT', type: 'range' }))).toBe(true)
    expect(isTypingTarget(target({ tagName: 'TEXTAREA' }))).toBe(true)
    expect(isTypingTarget(target({ isContentEditable: true }))).toBe(true)
    expect(isTypingTarget(target({ tagName: 'BUTTON' }))).toBe(false)
  })

  it('never fires plain shortcuts while typing but allows Ctrl/Cmd', () => {
    const search = target({ tagName: 'INPUT', type: 'search' })
    expect(shouldIgnoreShortcut({ key: 'n' }, search, false)).toBe(true)
    expect(shouldIgnoreShortcut({ key: '/' }, search, false)).toBe(true)
    expect(shouldIgnoreShortcut({ key: 'f', mod: true }, search, false)).toBe(false)
  })

  it('lets native Space/Enter activation win on buttons and menu roles', () => {
    expect(shouldIgnoreShortcut({ key: 'Space' }, target({ tagName: 'BUTTON' }), false)).toBe(true)
    expect(shouldIgnoreShortcut({ key: 'Space' }, target({ role: 'menuitem' }), false)).toBe(true)
    expect(shouldIgnoreShortcut({ key: 'Enter' }, target({ tagName: 'A' }), false)).toBe(true)
    expect(shouldIgnoreShortcut({ key: 'n' }, target({ tagName: 'BUTTON' }), false)).toBe(false)
  })
})
