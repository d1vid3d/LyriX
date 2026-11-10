import type { QueuePanelEntryRow, QueuePanelModel, QueuePanelRow } from '../queue/queuePanelModel'
import { QUEUE_PANEL_ROW_HEIGHT } from '../queue/queuePanelModel'
import {
  autoScrollDirection,
  dragRowShift,
  dropHoleSlot,
  insertionIndicatorTop,
  rowGapAtPointer,
  upcomingSlotFromGap
} from '../queue/dragReorder'
import { smallCoverUrl } from '../src/format'
import { createFavoriteButton } from './favoriteButton'
import type { MenuPosition } from './contextMenu'
import { attachMenuTrigger } from './menuTrigger'
import { VirtualList } from './virtualList'

export interface QueuePanelElements {
  panel: HTMLElement
  scroll: HTMLElement
  context: HTMLElement
  summary: HTMLElement
  clearButton: HTMLButtonElement
  closeButton: HTMLButtonElement
}

export interface QueuePanelCallbacks {
  onClose(): void
  onClear(): void
  onToggleHistory(): void
  onPlayEntry(entryId: string): void
  onRemoveEntry(entryId: string): void
  /** Slot is a gap index between upcoming rows (0..upcoming count). */
  onReorderEntry(entryId: string, slot: number): void
  onMoveEntry(entryId: string, direction: -1 | 1): void
  onOpenMenu(row: QueuePanelEntryRow, position: MenuPosition): void
  isFavorite?(trackId: string): boolean
  onToggleFavorite?(trackId: string): void
}

interface DragState {
  entryId: string
  slot: number
  pointerY: number
  /** The row left in place (hidden) while the clone follows the pointer. */
  sourceRow: HTMLElement
  /** Floating clone that follows the pointer. */
  ghost: HTMLElement
  grabOffsetY: number
  left: number
}

const AUTO_SCROLL_EDGE = 28
const AUTO_SCROLL_STEP = 14

/**
 * Virtualized queue slide-over. It renders a pure `QueuePanelModel` and emits intents; the
 * controller owns queue mutations and playback.
 */
export class QueuePanel {
  private readonly elements: QueuePanelElements
  private readonly callbacks: QueuePanelCallbacks
  private readonly virtualList: VirtualList<QueuePanelRow>
  private readonly insertion: HTMLDivElement
  private model: QueuePanelModel | null = null
  private openState = false
  private restoreFocusElement: HTMLElement | null = null
  private drag: DragState | null = null
  private autoScrollFrame: number | null = null

  constructor(elements: QueuePanelElements, callbacks: QueuePanelCallbacks) {
    this.elements = elements
    this.callbacks = callbacks

    elements.scroll.setAttribute('role', 'list')
    this.virtualList = new VirtualList<QueuePanelRow>({
      container: elements.scroll,
      rowHeight: QUEUE_PANEL_ROW_HEIGHT,
      overscan: 6,
      renderRow: (row) => this.createRow(row)
    })

    this.insertion = document.createElement('div')
    this.insertion.className = 'queue-insert-indicator'
    this.insertion.hidden = true
    elements.scroll.append(this.insertion)

    elements.closeButton.addEventListener('click', () => this.callbacks.onClose())
    elements.clearButton.addEventListener('click', () => this.callbacks.onClear())
  }

  update(model: QueuePanelModel): void {
    this.model = model
    this.applyHeader(model)

    if (this.openState) {
      this.virtualList.setItems(model.rows, { preserveScroll: true })
    }
  }

  open(): void {
    if (this.openState) return

    this.restoreFocusElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    this.openState = true
    this.elements.panel.hidden = false
    this.elements.panel.classList.add('queue-panel--open')

    if (!this.model) return

    this.applyHeader(this.model)
    this.virtualList.setItems(this.model.rows)
    this.scrollToCurrent()

    const target = this.model.currentEntryId ?? this.model.upcomingEntryIds[0] ?? null
    if (target) this.focusEntry(target)
    else this.elements.closeButton.focus({ preventScroll: true })
  }

  close(): void {
    if (!this.openState) return

    this.cancelDrag()
    this.openState = false
    this.elements.panel.classList.remove('queue-panel--open')
    this.elements.panel.hidden = true

    const restore = this.restoreFocusElement
    this.restoreFocusElement = null
    if (restore?.isConnected) restore.focus({ preventScroll: true })
  }

  toggle(): void {
    if (this.openState) this.close()
    else this.open()
  }

  isOpen(): boolean {
    return this.openState
  }

  /** Re-renders visible rows, e.g. after a favorite state change. */
  refresh(): void {
    this.virtualList.refresh()
  }

  destroy(): void {
    this.cancelDrag()
    this.virtualList.destroy()
    this.insertion.remove()
  }

  private applyHeader(model: QueuePanelModel): void {
    this.elements.context.textContent = model.contextLabel
    this.elements.summary.textContent = model.summaryLabel
    this.elements.clearButton.disabled = model.clearDisabled
  }

  private scrollToCurrent(): void {
    const model = this.model
    if (!model || model.currentRowIndex < 0) return

    const rowTop = model.currentRowIndex * QUEUE_PANEL_ROW_HEIGHT
    const viewport = this.elements.scroll.clientHeight
    this.elements.scroll.scrollTop = Math.max(
      0,
      rowTop - Math.max(0, (viewport - QUEUE_PANEL_ROW_HEIGHT) / 2)
    )
    this.virtualList.refresh()
  }

  private scrollRowIntoView(rowIndex: number): void {
    const scroller = this.elements.scroll
    const rowTop = rowIndex * QUEUE_PANEL_ROW_HEIGHT
    const rowBottom = rowTop + QUEUE_PANEL_ROW_HEIGHT
    const viewTop = scroller.scrollTop
    const viewBottom = viewTop + scroller.clientHeight

    if (rowTop < viewTop) scroller.scrollTop = rowTop
    else if (rowBottom > viewBottom) scroller.scrollTop = rowBottom - scroller.clientHeight
  }

  private entryIds(): string[] {
    if (!this.model) return []
    const ids: string[] = []
    for (const row of this.model.rows) {
      if (row.kind === 'entry') ids.push(row.entryId)
    }
    return ids
  }

  private focusEntry(entryId: string): void {
    if (!this.model) return

    const rowIndex = this.model.rows.findIndex(
      (row) => row.kind === 'entry' && row.entryId === entryId
    )
    if (rowIndex < 0) return

    this.scrollRowIntoView(rowIndex)
    this.virtualList.refresh()

    const element = this.elements.scroll.querySelector<HTMLElement>(`[data-entry-id="${entryId}"]`)
    element?.focus({ preventScroll: true })
  }

  private moveFocus(entryId: string, delta: -1 | 1): void {
    const ids = this.entryIds()
    const index = ids.indexOf(entryId)
    if (index < 0) return

    const next = index + delta
    if (next < 0 || next >= ids.length) return
    this.focusEntry(ids[next])
  }

  private focusEdge(edge: 'first' | 'last'): void {
    const ids = this.entryIds()
    if (ids.length === 0) return
    this.focusEntry(edge === 'first' ? ids[0] : ids[ids.length - 1])
  }

  private createRow(row: QueuePanelRow): HTMLElement {
    if (row.kind === 'section') return this.createSectionRow(row)
    if (row.kind === 'empty') {
      const element = document.createElement('div')
      element.className = 'queue-row queue-empty'
      element.setAttribute('role', 'presentation')
      element.textContent = row.label
      return element
    }

    return this.createEntryRow(row)
  }

  private createSectionRow(row: Extract<QueuePanelRow, { kind: 'section' }>): HTMLElement {
    if (row.collapsible) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'queue-row queue-section queue-section--toggle'
      button.setAttribute('role', 'presentation')
      button.setAttribute('aria-expanded', String(!row.collapsed))

      const chevron = document.createElement('span')
      chevron.className = 'queue-section-chevron'
      chevron.setAttribute('aria-hidden', 'true')
      chevron.textContent = row.collapsed ? '▸' : '▾'

      const label = document.createElement('span')
      label.className = 'queue-section-label'
      label.textContent = row.label

      const count = document.createElement('span')
      count.className = 'queue-section-count'
      count.textContent = String(row.count)

      button.append(chevron, label, count)
      button.addEventListener('click', () => this.callbacks.onToggleHistory())
      return button
    }

    const element = document.createElement('div')
    element.className = 'queue-row queue-section'
    element.setAttribute('role', 'presentation')

    const label = document.createElement('span')
    label.className = 'queue-section-label'
    label.textContent = row.label

    const count = document.createElement('span')
    count.className = 'queue-section-count'
    count.textContent = String(row.count)

    element.append(label, count)
    return element
  }

  private createEntryRow(row: QueuePanelEntryRow): HTMLElement {
    const element = document.createElement('div')
    element.className = 'queue-row queue-entry'
    element.dataset.entryId = row.entryId
    element.tabIndex = -1
    element.setAttribute('role', 'listitem')

    if (row.isCurrent) {
      element.classList.add('queue-entry--current')
      element.setAttribute('aria-current', 'true')
    }
    if (row.section === 'history') element.classList.add('queue-entry--history')

    const handle = document.createElement('span')
    handle.className = 'queue-drag-handle'
    handle.setAttribute('aria-hidden', 'true')
    if (row.canDrag) {
      handle.textContent = '⋮⋮'
      handle.addEventListener('pointerdown', (event) => this.startDrag(event, row, element))
    } else {
      handle.classList.add('queue-drag-handle--static')
    }

    const cover = createQueueCover(row)

    const meta = document.createElement('div')
    meta.className = 'queue-entry-meta'

    const title = document.createElement('span')
    title.className = 'queue-entry-title'
    title.textContent = row.track.title

    const artist = document.createElement('span')
    artist.className = 'queue-entry-artist'
    artist.textContent = row.artistName ?? row.track.artist

    meta.append(title, artist)

    const duration = document.createElement('span')
    duration.className = 'queue-entry-duration'
    duration.textContent = row.durationLabel

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'queue-entry-remove'
    remove.textContent = '×'
    if (row.canRemove) {
      remove.setAttribute('aria-label', `Remove ${row.track.title} from queue`)
      remove.title = 'Remove from queue'
      remove.addEventListener('click', (event) => {
        event.stopPropagation()
        this.callbacks.onRemoveEntry(row.entryId)
      })
    } else {
      remove.disabled = true
      remove.tabIndex = -1
    }

    element.append(handle, cover, meta, duration)
    if (this.callbacks.isFavorite && this.callbacks.onToggleFavorite) {
      element.append(
        createFavoriteButton(
          row.track.id,
          this.callbacks.isFavorite(row.track.id),
          this.callbacks.onToggleFavorite
        )
      )
    }
    element.append(remove)
    element.addEventListener('dblclick', () => this.callbacks.onPlayEntry(row.entryId))
    element.addEventListener('keydown', (event) => this.handleRowKeydown(event, row, element))
    attachMenuTrigger(element, (position) => this.callbacks.onOpenMenu(row, position))
    this.applyDragRowState(element, row.entryId)
    return element
  }

  private handleRowKeydown(
    event: KeyboardEvent,
    row: QueuePanelEntryRow,
    element: HTMLElement
  ): void {
    if (event.target !== element) return

    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      if (!row.canDrag) return
      event.preventDefault()
      this.callbacks.onMoveEntry(row.entryId, event.key === 'ArrowUp' ? -1 : 1)
      return
    }

    switch (event.key) {
      case 'Enter':
        event.preventDefault()
        this.callbacks.onPlayEntry(row.entryId)
        return
      case 'Delete':
      case 'Backspace':
        if (!row.canRemove) return
        event.preventDefault()
        this.callbacks.onRemoveEntry(row.entryId)
        return
      case 'ArrowUp':
        event.preventDefault()
        this.moveFocus(row.entryId, -1)
        return
      case 'ArrowDown':
        event.preventDefault()
        this.moveFocus(row.entryId, 1)
        return
      case 'Home':
        event.preventDefault()
        this.focusEdge('first')
        return
      case 'End':
        event.preventDefault()
        this.focusEdge('last')
        return
      default:
        return
    }
  }

  private startDrag(event: PointerEvent, row: QueuePanelEntryRow, element: HTMLElement): void {
    if (event.button !== 0 || !row.canDrag || !this.model) return

    event.preventDefault()
    event.stopPropagation()

    const rect = element.getBoundingClientRect()
    const ghost = element.cloneNode(true) as HTMLElement
    ghost.classList.add('queue-drag-ghost')
    ghost.classList.remove('queue-entry--current')
    ghost.removeAttribute('data-entry-id')
    ghost.removeAttribute('tabindex')
    ghost.removeAttribute('aria-current')
    ghost.setAttribute('aria-hidden', 'true')
    ghost.style.setProperty('--queue-panel-drag-width', `${rect.width}px`)
    document.body.append(ghost)

    element.classList.add('queue-entry--source')

    this.drag = {
      entryId: row.entryId,
      slot: Math.max(0, this.model.upcomingEntryIds.indexOf(row.entryId)),
      pointerY: event.clientY,
      sourceRow: element,
      ghost,
      grabOffsetY: event.clientY - rect.top,
      left: rect.left
    }

    this.elements.panel.classList.add('queue-panel--dragging')
    document.body.classList.add('is-reordering')
    window.addEventListener('pointermove', this.handleDragMove, { passive: false })
    window.addEventListener('pointerup', this.handleDragEnd)
    window.addEventListener('pointercancel', this.handleDragCancel)
    window.addEventListener('keydown', this.handleDragKeydown, true)

    this.positionGhost()
    this.renderInsertionIndicator()
    this.autoScrollFrame = requestAnimationFrame(this.tickAutoScroll)
  }

  private readonly handleDragMove = (event: PointerEvent): void => {
    if (!this.drag) return
    event.preventDefault()
    this.drag.pointerY = event.clientY
    this.positionGhost()
    this.updateDragSlot()
  }

  private positionGhost(): void {
    const drag = this.drag
    if (!drag) return

    drag.ghost.style.setProperty('--queue-panel-drag-x', `${drag.left}px`)
    drag.ghost.style.setProperty('--queue-panel-drag-y', `${drag.pointerY - drag.grabOffsetY}px`)
  }

  private readonly handleDragEnd = (): void => {
    this.finishDrag(true)
  }

  private readonly handleDragCancel = (): void => {
    this.finishDrag(false)
  }

  private readonly handleDragKeydown = (event: KeyboardEvent): void => {
    if (!this.drag || event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    this.cancelDrag()
  }

  private readonly tickAutoScroll = (): void => {
    if (!this.drag) {
      this.autoScrollFrame = null
      return
    }

    const scroller = this.elements.scroll
    const rect = scroller.getBoundingClientRect()
    const direction = autoScrollDirection(
      this.drag.pointerY,
      rect.top,
      rect.bottom,
      AUTO_SCROLL_EDGE
    )

    if (direction !== 0) {
      const before = scroller.scrollTop
      scroller.scrollTop = before + direction * AUTO_SCROLL_STEP
      if (scroller.scrollTop !== before) this.updateDragSlot()
    }

    this.autoScrollFrame = requestAnimationFrame(this.tickAutoScroll)
  }

  private updateDragSlot(): void {
    const model = this.model
    const drag = this.drag
    if (!model || !drag) return

    const rect = this.elements.scroll.getBoundingClientRect()
    const gap = rowGapAtPointer({
      pointerY: drag.pointerY,
      listTop: rect.top,
      scrollTop: this.elements.scroll.scrollTop,
      rowHeight: QUEUE_PANEL_ROW_HEIGHT,
      rowCount: model.rows.length
    })

    drag.slot = upcomingSlotFromGap(gap, model.upcomingStartRow, model.upcomingRowCount)
    this.applyRowShifts()
    this.renderInsertionIndicator()
  }

  /** Shifts rendered upcoming rows to open a hole at the current drop position. */
  private applyRowShifts(): void {
    const model = this.model
    const drag = this.drag
    if (!model || !drag) return

    const upcoming = model.upcomingEntryIds
    const sourceSlot = upcoming.indexOf(drag.entryId)
    if (sourceSlot < 0) return

    const slots = new Map(upcoming.map((id, index) => [id, index]))
    for (const element of this.elements.scroll.querySelectorAll<HTMLElement>('.queue-entry')) {
      const entryId = element.dataset.entryId
      if (!entryId || entryId === drag.entryId) continue

      const index = slots.get(entryId)
      if (index === undefined) continue
      this.applyRowShift(element, index, sourceSlot, drag.slot)
    }
  }

  private applyRowShift(
    element: HTMLElement,
    index: number,
    sourceSlot: number,
    targetSlot: number
  ): void {
    const shift = dragRowShift(index, sourceSlot, targetSlot)
    if (shift === 0) {
      element.classList.remove('queue-entry--shifted')
      element.style.removeProperty('--queue-panel-row-shift')
      return
    }

    element.style.setProperty('--queue-panel-row-shift', `${shift * QUEUE_PANEL_ROW_HEIGHT}px`)
    element.classList.add('queue-entry--shifted')
  }

  /** Reapplies the live drag visuals when auto-scroll renders fresh rows. */
  private applyDragRowState(element: HTMLElement, entryId: string): void {
    const model = this.model
    const drag = this.drag
    if (!model || !drag) return

    if (entryId === drag.entryId) {
      element.classList.add('queue-entry--source')
      return
    }

    const upcoming = model.upcomingEntryIds
    const sourceSlot = upcoming.indexOf(drag.entryId)
    const index = upcoming.indexOf(entryId)
    if (sourceSlot < 0 || index < 0) return
    this.applyRowShift(element, index, sourceSlot, drag.slot)
  }

  private renderInsertionIndicator(): void {
    const model = this.model
    const drag = this.drag
    if (!model || !drag) return

    const sourceSlot = model.upcomingEntryIds.indexOf(drag.entryId)
    const visualSlot = sourceSlot < 0 ? drag.slot : dropHoleSlot(sourceSlot, drag.slot)
    const rowGap = model.upcomingStartRow + visualSlot
    this.insertion.style.setProperty(
      '--queue-insert-top',
      `${insertionIndicatorTop(rowGap, QUEUE_PANEL_ROW_HEIGHT)}px`
    )
    this.insertion.hidden = false
  }

  private finishDrag(commit: boolean): void {
    const drag = this.drag
    this.cleanupDrag()
    if (commit && drag) this.callbacks.onReorderEntry(drag.entryId, drag.slot)
  }

  private cancelDrag(): void {
    this.finishDrag(false)
  }

  private cleanupDrag(): void {
    const drag = this.drag
    this.drag = null
    if (this.autoScrollFrame !== null) {
      cancelAnimationFrame(this.autoScrollFrame)
      this.autoScrollFrame = null
    }

    window.removeEventListener('pointermove', this.handleDragMove)
    window.removeEventListener('pointerup', this.handleDragEnd)
    window.removeEventListener('pointercancel', this.handleDragCancel)
    window.removeEventListener('keydown', this.handleDragKeydown, true)

    drag?.ghost.remove()
    drag?.sourceRow.classList.remove('queue-entry--source')
    for (const element of this.elements.scroll.querySelectorAll<HTMLElement>(
      '.queue-entry--source, .queue-entry--shifted'
    )) {
      element.classList.remove('queue-entry--source', 'queue-entry--shifted')
      element.style.removeProperty('--queue-panel-row-shift')
    }

    this.elements.panel.classList.remove('queue-panel--dragging')
    document.body.classList.remove('is-reordering')
    this.insertion.hidden = true
  }
}

function createQueueCover(row: QueuePanelEntryRow): HTMLDivElement {
  const cover = document.createElement('div')
  cover.className = 'cover queue-entry-cover'

  if (row.coverUrl) {
    const image = document.createElement('img')
    image.loading = 'lazy'
    image.decoding = 'async'
    image.alt = ''
    image.src = smallCoverUrl(row.coverUrl)
    image.addEventListener('error', () => {
      image.hidden = true
    })
    cover.append(image)
  }

  const fallback = document.createElement('span')
  fallback.className = 'cover-fallback'
  fallback.setAttribute('aria-hidden', 'true')
  fallback.textContent = '♪'
  cover.append(fallback)
  return cover
}
