import { describe, expect, it } from 'vitest'
import {
  autoScrollDirection,
  dragRowShift,
  dropHoleSlot,
  insertionIndicatorTop,
  keyboardMoveTarget,
  moveDestinationForSlot,
  rowGapAtPointer,
  upcomingSlotFromGap
} from '../src/renderer/queue/dragReorder'

describe('rowGapAtPointer', () => {
  const base = {
    listTop: 100,
    scrollTop: 0,
    rowHeight: 56,
    rowCount: 10
  }

  it('rounds to the nearest row boundary and clamps to the list', () => {
    expect(rowGapAtPointer({ ...base, pointerY: 100 })).toBe(0)
    expect(rowGapAtPointer({ ...base, pointerY: 127 })).toBe(0)
    expect(rowGapAtPointer({ ...base, pointerY: 129 })).toBe(1)
    expect(rowGapAtPointer({ ...base, pointerY: 100 + 56 * 3 })).toBe(3)
    expect(rowGapAtPointer({ ...base, pointerY: 20 })).toBe(0)
    expect(rowGapAtPointer({ ...base, pointerY: 2000 })).toBe(10)
  })

  it('accounts for scroll offset', () => {
    expect(rowGapAtPointer({ ...base, pointerY: 100, scrollTop: 56 * 2 })).toBe(2)
  })

  it('returns zero for an empty list', () => {
    expect(rowGapAtPointer({ ...base, rowCount: 0, pointerY: 500 })).toBe(0)
  })
})

describe('upcomingSlotFromGap', () => {
  it('maps a whole-list gap into the upcoming range', () => {
    expect(upcomingSlotFromGap(0, 3, 4)).toBe(0)
    expect(upcomingSlotFromGap(3, 3, 4)).toBe(0)
    expect(upcomingSlotFromGap(4, 3, 4)).toBe(1)
    expect(upcomingSlotFromGap(7, 3, 4)).toBe(4)
    expect(upcomingSlotFromGap(20, 3, 4)).toBe(4)
  })

  it('returns zero when there is nothing draggable', () => {
    expect(upcomingSlotFromGap(5, -1, 0)).toBe(0)
    expect(upcomingSlotFromGap(5, 3, 0)).toBe(0)
  })
})

describe('moveDestinationForSlot', () => {
  const upcoming = ['a', 'b', 'c']

  it('maps gaps to the post-removal destination', () => {
    expect(moveDestinationForSlot(0, upcoming, 'a', 0)).toBe(1)
    expect(moveDestinationForSlot(0, upcoming, 'a', 1)).toBe(1)
    expect(moveDestinationForSlot(0, upcoming, 'a', 2)).toBe(2)
    expect(moveDestinationForSlot(0, upcoming, 'a', 3)).toBe(3)
    expect(moveDestinationForSlot(0, upcoming, 'b', 0)).toBe(1)
    expect(moveDestinationForSlot(0, upcoming, 'b', 1)).toBe(2)
    expect(moveDestinationForSlot(0, upcoming, 'b', 2)).toBe(2)
    expect(moveDestinationForSlot(0, upcoming, 'c', 0)).toBe(1)
    expect(moveDestinationForSlot(0, upcoming, 'c', 3)).toBe(3)
  })

  it('works without a current entry and rejects unknown entries', () => {
    expect(moveDestinationForSlot(-1, upcoming, 'a', 2)).toBe(1)
    expect(moveDestinationForSlot(0, upcoming, 'missing', 0)).toBeNull()
  })
})

describe('keyboardMoveTarget', () => {
  it('moves upcoming entries by one and stops at the bounds', () => {
    expect(keyboardMoveTarget(4, 2, 6, -1)).toBe(3)
    expect(keyboardMoveTarget(4, 2, 6, 1)).toBe(5)
    expect(keyboardMoveTarget(3, 2, 6, -1)).toBeNull()
    expect(keyboardMoveTarget(5, 2, 6, 1)).toBeNull()
  })

  it('never moves the current or history entries', () => {
    expect(keyboardMoveTarget(2, 2, 6, -1)).toBeNull()
    expect(keyboardMoveTarget(2, 2, 6, 1)).toBeNull()
    expect(keyboardMoveTarget(1, 2, 6, -1)).toBeNull()
    expect(keyboardMoveTarget(1, 2, 6, 1)).toBeNull()
  })

  it('allows moves when the queue has no current entry', () => {
    expect(keyboardMoveTarget(0, -1, 3, 1)).toBe(1)
    expect(keyboardMoveTarget(2, -1, 3, 1)).toBeNull()
  })
})

describe('autoScrollDirection', () => {
  it('activates only near the viewport edges', () => {
    expect(autoScrollDirection(110, 100, 500, 28)).toBe(-1)
    expect(autoScrollDirection(490, 100, 500, 28)).toBe(1)
    expect(autoScrollDirection(300, 100, 500, 28)).toBe(0)
  })
})

describe('insertionIndicatorTop', () => {
  it('uses the row gap and height', () => {
    expect(insertionIndicatorTop(0, 56)).toBe(0)
    expect(insertionIndicatorTop(3, 56)).toBe(168)
    expect(insertionIndicatorTop(-2, 56)).toBe(0)
  })
})

describe('dropHoleSlot', () => {
  it('keeps the source slot when dropping in place or right after itself', () => {
    expect(dropHoleSlot(2, 2)).toBe(2)
    expect(dropHoleSlot(2, 3)).toBe(2)
  })

  it('lands one slot above the insertion gap when moving down', () => {
    expect(dropHoleSlot(0, 3)).toBe(2)
    expect(dropHoleSlot(1, 5)).toBe(4)
  })

  it('matches the insertion slot when moving up', () => {
    expect(dropHoleSlot(4, 1)).toBe(1)
    expect(dropHoleSlot(4, 0)).toBe(0)
  })
})

describe('dragRowShift', () => {
  it('shifts intervening rows up when moving down', () => {
    expect(dragRowShift(2, 1, 4)).toBe(-1)
    expect(dragRowShift(3, 1, 4)).toBe(-1)
    expect(dragRowShift(1, 1, 4)).toBe(0)
    expect(dragRowShift(0, 1, 4)).toBe(0)
    expect(dragRowShift(4, 1, 4)).toBe(0)
  })

  it('shifts intervening rows down when moving up', () => {
    expect(dragRowShift(2, 4, 1)).toBe(1)
    expect(dragRowShift(3, 4, 1)).toBe(1)
    expect(dragRowShift(1, 4, 1)).toBe(1)
    expect(dragRowShift(0, 4, 1)).toBe(0)
    expect(dragRowShift(4, 4, 1)).toBe(0)
  })

  it('never shifts rows when the slot does not change', () => {
    for (let index = 0; index < 5; index += 1) {
      expect(dragRowShift(index, 2, 2)).toBe(0)
      expect(dragRowShift(index, 2, 3)).toBe(0)
    }
  })
})
