import { describe, expect, it } from 'vitest'
import { resolveWindowBounds } from '../src/main/windowBounds'
import type { DisplayInfo, Rect } from '../src/main/windowBounds'

const defaults: Rect = { x: 0, y: 0, width: 1040, height: 760 }
const minSize = { width: 620, height: 440 }
const primary: DisplayInfo = { workArea: { x: 0, y: 0, width: 1920, height: 1040 }, primary: true }
const secondary: DisplayInfo = {
  workArea: { x: 1920, y: 0, width: 1920, height: 1040 }
}

function saved(bounds: Partial<Rect>, maximized = false): unknown {
  return { bounds: { ...defaults, ...bounds }, maximized }
}

describe('resolveWindowBounds', () => {
  it('uses centered defaults when nothing is saved', () => {
    const result = resolveWindowBounds(null, [primary], defaults, minSize)
    expect(result).toEqual({
      bounds: { x: 440, y: 140, width: 1040, height: 760 },
      maximized: false
    })
  })

  it('rejects malformed saved data', () => {
    const invalid = [
      'nope',
      { bounds: null, maximized: false },
      { bounds: { x: 0, y: 0, width: 0, height: 760 } },
      { bounds: { x: Number.NaN, y: 0, width: 800, height: 600 } },
      { bounds: { x: 10, y: 10, width: '800', height: 600 } }
    ]

    for (const value of invalid) {
      const result = resolveWindowBounds(value, [primary], defaults, minSize)
      expect(result.bounds).toEqual({ x: 440, y: 140, width: 1040, height: 760 })
    }
  })

  it('clamps a saved size below the minimum', () => {
    const result = resolveWindowBounds(
      saved({ x: 100, y: 100, width: 400, height: 300 }),
      [primary],
      defaults,
      minSize
    )
    expect(result.bounds).toEqual({ x: 100, y: 100, width: 620, height: 440 })
  })

  it('keeps bounds that intersect a work area enough', () => {
    const result = resolveWindowBounds(
      saved({ x: 1800, y: 100, width: 400, height: 300 }),
      [primary],
      defaults,
      minSize
    )
    expect(result.bounds).toEqual({ x: 1800, y: 100, width: 620, height: 440 })
  })

  it('recenters off-screen bounds on the primary display', () => {
    const result = resolveWindowBounds(
      saved({ x: 5000, y: 2000 }),
      [primary, secondary],
      defaults,
      minSize
    )
    expect(result.bounds).toEqual({ x: 440, y: 140, width: 1040, height: 760 })
  })

  it('recenters when the monitor a window was on was unplugged', () => {
    const unplugged: DisplayInfo = {
      workArea: { x: 3840, y: 0, width: 1920, height: 1040 }
    }
    const result = resolveWindowBounds(saved({ x: 3900, y: 100 }), [primary], defaults, minSize)
    expect(result.bounds).toEqual({ x: 440, y: 140, width: 1040, height: 760 })

    const stillAttached = resolveWindowBounds(
      saved({ x: 3900, y: 100 }),
      [primary, unplugged],
      defaults,
      minSize
    )
    expect(stillAttached.bounds.x).toBe(3900)
  })

  it('passes the maximized flag through', () => {
    const result = resolveWindowBounds(
      saved({ x: 100, y: 100 }, true),
      [primary],
      defaults,
      minSize
    )
    expect(result.maximized).toBe(true)
  })
})
