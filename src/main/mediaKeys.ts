import { globalShortcut } from 'electron'
import type { MediaKeyAction } from '../shared/types'

const ACCELERATORS: ReadonlyArray<{ accelerator: string; action: MediaKeyAction }> = [
  { accelerator: 'MediaPlayPause', action: 'playpause' },
  { accelerator: 'MediaNextTrack', action: 'next' },
  { accelerator: 'MediaPreviousTrack', action: 'previous' },
  { accelerator: 'MediaStop', action: 'stop' }
]

/**
 * Fallback media-key route. Only used when `MEDIA_KEY_MODE` is `global-shortcuts`; the primary
 * route relies on Chromium's Media Session service. Registering both would double-fire keys.
 */
export function registerGlobalMediaKeys(
  send: (action: MediaKeyAction) => void
): void {
  for (const { accelerator, action } of ACCELERATORS) {
    try {
      const registered = globalShortcut.register(accelerator, () => send(action))
      if (!registered) {
        console.warn(`[media] Could not register ${accelerator}`)
      }
    } catch (error) {
      console.warn(`[media] Media key ${accelerator} is unavailable`, error)
    }
  }
}

export function unregisterGlobalMediaKeys(): void {
  for (const { accelerator } of ACCELERATORS) {
    if (globalShortcut.isRegistered(accelerator)) globalShortcut.unregister(accelerator)
  }
}
