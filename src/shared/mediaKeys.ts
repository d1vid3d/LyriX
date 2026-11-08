/**
 * Exactly one media-key mechanism may be active so keys never fire twice.
 *
 * `media-session` is the primary route: Chromium's Media Session service integrates with the
 * Windows system media overlay and hardware media keys. `global-shortcuts` is the fallback:
 * Electron `globalShortcut` accelerators forward actions over IPC instead.
 */
export type MediaKeyMode = 'media-session' | 'global-shortcuts'

/**
 * The primary route for this Windows target: Chromium's Media Session service. The automated suites
 * verify the renderer side (API/metadata/state), but hardware media keys and the Windows overlay
 * require a manual check. Flip this to `global-shortcuts` only if that check fails.
 */
export const MEDIA_KEY_MODE: MediaKeyMode = 'media-session'
