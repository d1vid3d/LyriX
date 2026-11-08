import { readJsonFile, writeJsonAtomic } from './json-file'
import type { Rect } from './windowBounds'

const WINDOW_STATE_VERSION = 1
const SAVE_DEBOUNCE_MS = 500

export interface StoredWindowState {
  bounds: Rect
  maximized: boolean
}

interface WindowStateFile extends StoredWindowState {
  version: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeBounds(value: unknown): Rect | null {
  if (!isRecord(value)) return null
  const numbers = ['x', 'y', 'width', 'height'] as const
  for (const key of numbers) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) return null
  }
  if ((value.width as number) <= 0 || (value.height as number) <= 0) return null
  return {
    x: Math.round(value.x as number),
    y: Math.round(value.y as number),
    width: Math.round(value.width as number),
    height: Math.round(value.height as number)
  }
}

/** Tolerant read: wrong version or malformed data means "no saved window state". */
export async function loadWindowState(filePath: string): Promise<StoredWindowState | null> {
  const raw = await readJsonFile<unknown>(filePath, null)
  if (!isRecord(raw) || raw.version !== WINDOW_STATE_VERSION) return null

  const bounds = normalizeBounds(raw.bounds)
  if (!bounds) return null

  return { bounds, maximized: raw.maximized === true }
}

/**
 * Debounces window-state writes so resize/move bursts produce one atomic file write. The last
 * captured state is also written synchronously-ish on close by calling `flush`.
 */
export class WindowStateWriter {
  private readonly filePath: string
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending: StoredWindowState | null = null

  constructor(filePath: string) {
    this.filePath = filePath
  }

  schedule(state: StoredWindowState): void {
    this.pending = state
    if (this.timer !== null) return

    this.timer = setTimeout(() => {
      this.timer = null
      const pending = this.pending
      this.pending = null
      if (pending) void this.write(pending)
    }, SAVE_DEBOUNCE_MS)
  }

  flush(state: StoredWindowState): void {
    this.pending = null
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    void this.write(state)
  }

  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.pending = null
  }

  private async write(state: StoredWindowState): Promise<void> {
    const payload: WindowStateFile = {
      version: WINDOW_STATE_VERSION,
      bounds: state.bounds,
      maximized: state.maximized
    }
    try {
      await writeJsonAtomic(this.filePath, payload)
    } catch (error) {
      console.error('[window] Could not save the window state', error)
    }
  }
}
