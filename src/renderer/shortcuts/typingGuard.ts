import { isModifierChord } from './shortcutRegistry'
import type { KeyChord } from './shortcutRegistry'

export interface FocusDescriptor {
  tagName: string
  type: string
  isContentEditable: boolean
  role: string | null
}

const TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'time',
  'week'
])

const ACTIVATION_ROLES: ReadonlySet<string> = new Set([
  'button',
  'link',
  'menuitem',
  'menuitemradio',
  'menuitemcheckbox',
  'option',
  'switch',
  'checkbox',
  'radio',
  'tab'
])

/** Text-entry and native-arrow targets never receive plain-key shortcuts. */
export function isTypingTarget(target: FocusDescriptor): boolean {
  if (target.isContentEditable) return true
  if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true
  if (target.tagName !== 'INPUT') return false
  if (target.type === 'range') return true
  return target.type === '' || TEXT_INPUT_TYPES.has(target.type)
}

function isActivationTarget(target: FocusDescriptor): boolean {
  if (target.tagName === 'BUTTON' || target.tagName === 'A') return true
  if (target.tagName === 'INPUT' && (target.type === 'checkbox' || target.type === 'radio')) {
    return true
  }
  return target.role !== null && ACTIVATION_ROLES.has(target.role)
}

/**
 * Plain-key (no Ctrl/Cmd/Alt) shortcuts must not take over typing or native Space/Enter
 * activation. Modified shortcuts are allowed while typing.
 */
export function shouldIgnoreShortcut(
  chord: KeyChord,
  target: FocusDescriptor,
  isMac: boolean
): boolean {
  if (isModifierChord(chord, isMac)) return false
  if (isTypingTarget(target)) return true

  const key = chord.key === ' ' ? 'Space' : chord.key
  if ((key === 'Space' || key === 'Enter') && isActivationTarget(target)) return true
  return false
}
