import { describe, expect, it, vi } from 'vitest'
import { EscapeLayerStack } from '../src/renderer/shortcuts/layerStack'

function layer(id: string, priority: number, open = true) {
  let isOpen = open
  return {
    layer: {
      id,
      priority,
      isOpen: () => isOpen,
      close: vi.fn(() => {
        isOpen = false
      })
    },
    open: (value: boolean) => {
      isOpen = value
    }
  }
}

describe('EscapeLayerStack', () => {
  it('closes exactly the highest-priority open layer', () => {
    const stack = new EscapeLayerStack()
    const low = layer('low', 10)
    const high = layer('high', 20)
    stack.register(low.layer)
    stack.register(high.layer)

    expect(stack.closeTop()).toBe(true)
    expect(high.layer.close).toHaveBeenCalledTimes(1)
    expect(low.layer.close).not.toHaveBeenCalled()
  })

  it('skips closed layers and returns false when nothing is open', () => {
    const stack = new EscapeLayerStack()
    const closed = layer('closed', 50, false)
    const open = layer('open', 20)
    stack.register(closed.layer)
    stack.register(open.layer)

    expect(stack.openLayerIds()).toEqual(['open'])
    expect(stack.closeTop()).toBe(true)
    expect(open.layer.close).toHaveBeenCalledTimes(1)
    expect(stack.closeTop()).toBe(false)
  })

  it('uses later registration for equal priorities and supports unregistering', () => {
    const stack = new EscapeLayerStack()
    const first = layer('first', 10)
    const second = layer('second', 10)
    const dispose = stack.register(first.layer)
    stack.register(second.layer)

    expect(stack.openLayerIds()).toEqual(['second', 'first'])
    dispose()
    expect(stack.openLayerIds()).toEqual(['second'])
  })
})
