/** Pure window-bounds decision logic for launch restore. */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface DisplayInfo {
  workArea: Rect
  primary?: boolean
}

export interface WindowMinSize {
  width: number
  height: number
}

export interface SavedWindowState {
  bounds: Rect
  maximized: boolean
}

export interface ResolvedWindowBounds {
  bounds: Rect
  maximized: boolean
}

/** A window must keep at least this much width/height inside a work area to count as visible. */
const MIN_VISIBLE_EDGE = 120

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeRect(value: unknown): Rect | null {
  if (!isRecord(value)) return null
  if (!finite(value.x) || !finite(value.y)) return null
  if (!finite(value.width) || !finite(value.height)) return null
  if (value.width <= 0 || value.height <= 0) return null
  return {
    x: Math.round(value.x),
    y: Math.round(value.y),
    width: Math.round(value.width),
    height: Math.round(value.height)
  }
}

function intersection(first: Rect, second: Rect): { width: number; height: number } {
  const left = Math.max(first.x, second.x)
  const top = Math.max(first.y, second.y)
  const right = Math.min(first.x + first.width, second.x + second.width)
  const bottom = Math.min(first.y + first.height, second.y + second.height)
  return {
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  }
}

/** True when the window keeps a usable strip inside the display's work area. */
export function intersectsEnough(bounds: Rect, workArea: Rect): boolean {
  const overlap = intersection(bounds, workArea)
  return (
    overlap.width >= Math.min(MIN_VISIBLE_EDGE, bounds.width) &&
    overlap.height >= Math.min(MIN_VISIBLE_EDGE, bounds.height)
  )
}

function clampSize(bounds: Rect, minSize: WindowMinSize): Rect {
  return {
    ...bounds,
    width: Math.max(minSize.width, bounds.width),
    height: Math.max(minSize.height, bounds.height)
  }
}

function centerIn(workArea: Rect, size: WindowMinSize): Rect {
  const width = Math.round(size.width)
  const height = Math.round(size.height)
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height
  }
}

/**
 * Resolves the window bounds for launch:
 * - no/invalid saved state falls back to the defaults;
 * - the size is clamped to the minimum;
 * - bounds that no longer sufficiently intersect a connected display's work area are recentered
 *   on the primary display (for example after a monitor was unplugged);
 * - the saved maximized flag is passed through.
 */
export function resolveWindowBounds(
  saved: unknown,
  displays: readonly DisplayInfo[],
  defaults: Rect,
  minSize: WindowMinSize
): ResolvedWindowBounds {
  const validSaved = isRecord(saved)
    ? (() => {
        const bounds = normalizeRect(saved.bounds)
        if (!bounds) return null
        return {
          bounds,
          maximized: saved.maximized === true
        } satisfies SavedWindowState
      })()
    : null

  const fallback = clampSize(defaults, minSize)
  const primary = displays.find((display) => display.primary) ?? displays[0] ?? null

  if (!validSaved) {
    return {
      bounds: primary ? centerIn(primary.workArea, fallback) : fallback,
      maximized: false
    }
  }

  const clamped = clampSize(validSaved.bounds, minSize)
  const visible = displays.some((display) => intersectsEnough(clamped, display.workArea))

  return {
    bounds: visible || !primary ? clamped : centerIn(primary.workArea, clamped),
    maximized: validSaved.maximized
  }
}
