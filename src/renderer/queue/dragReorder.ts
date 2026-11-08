/** Pure geometry and index math for queue drag-reordering and keyboard moves. */

export interface PointerRowInput {
  pointerY: number
  listTop: number
  scrollTop: number
  rowHeight: number
  rowCount: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Nearest insertion boundary (0..rowCount) under the pointer. */
export function rowGapAtPointer(input: PointerRowInput): number {
  if (input.rowCount <= 0 || input.rowHeight <= 0) return 0

  const offset = input.pointerY - input.listTop + input.scrollTop
  return clamp(Math.round(offset / input.rowHeight), 0, input.rowCount)
}

/** Converts a whole-list row gap into a gap between upcoming rows. */
export function upcomingSlotFromGap(
  rowGap: number,
  upcomingStartRow: number,
  upcomingRowCount: number
): number {
  if (upcomingStartRow < 0 || upcomingRowCount <= 0) return 0
  return clamp(rowGap - upcomingStartRow, 0, upcomingRowCount)
}

/**
 * Maps a slot in the upcoming list to the destination index `PlaybackQueue.move` expects.
 * `move` removes the entry before inserting, so a slot below the source shifts left by one.
 */
export function moveDestinationForSlot(
  currentIndex: number,
  upcomingEntryIds: readonly string[],
  entryId: string,
  slot: number
): number | null {
  const fromUpcoming = upcomingEntryIds.indexOf(entryId)
  if (fromUpcoming < 0) return null

  const clamped = clamp(Math.trunc(slot), 0, upcomingEntryIds.length)
  const adjusted = clamped > fromUpcoming ? clamped - 1 : clamped
  const base = currentIndex >= 0 ? currentIndex + 1 : 0
  return base + adjusted
}

/** Destination for Alt+Arrow moves; only entries after the current one may move. */
export function keyboardMoveTarget(
  entryIndex: number,
  currentIndex: number,
  entryCount: number,
  delta: -1 | 1
): number | null {
  if (entryIndex <= currentIndex) return null

  const target = entryIndex + delta
  if (target <= currentIndex || target >= entryCount) return null
  return target
}

export type AutoScrollDirection = -1 | 0 | 1

/** -1 scrolls up, 1 scrolls down, 0 stays put. */
export function autoScrollDirection(
  pointerY: number,
  viewportTop: number,
  viewportBottom: number,
  edge: number
): AutoScrollDirection {
  if (pointerY < viewportTop + edge) return -1
  if (pointerY > viewportBottom - edge) return 1
  return 0
}

/** Absolute content offset for the insertion indicator. */
export function insertionIndicatorTop(rowGap: number, rowHeight: number): number {
  return Math.max(0, rowGap) * rowHeight
}

/**
 * Post-removal slot where a dragged upcoming row will land. The source row keeps its layout space
 * while dragging, so moving down leaves the visual hole one slot above the insertion gap.
 */
export function dropHoleSlot(sourceSlot: number, targetSlot: number): number {
  const source = Math.max(0, Math.trunc(sourceSlot))
  const target = Math.max(0, Math.trunc(targetSlot))
  return target > source ? target - 1 : target
}

/**
 * How far (in rows) an upcoming row moves to make room: -1 up, 1 down, 0 stays. Rows outside the
 * range between the source and target slots never move.
 */
export function dragRowShift(
  index: number,
  sourceSlot: number,
  targetSlot: number
): -1 | 0 | 1 {
  if (sourceSlot < targetSlot && index > sourceSlot && index < targetSlot) return -1
  if (targetSlot < sourceSlot && index >= targetSlot && index < sourceSlot) return 1
  return 0
}
