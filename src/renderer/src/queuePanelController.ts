import type { Album, Track } from '../../shared/types'
import { TOAST_MESSAGES } from '../menus/toastMessages'
import type { PlaybackQueue } from '../player/queue'
import { keyboardMoveTarget, moveDestinationForSlot } from '../queue/dragReorder'
import type { QueuePanelEntryRow, QueuePanelModel } from '../queue/queuePanelModel'
import { buildQueuePanelModel } from '../queue/queuePanelModel'
import type { MenuPosition } from '../ui/contextMenu'
import type { QueuePanel } from '../ui/queuePanel'

export interface QueuePanelControllerDeps {
  panel: QueuePanel
  queue: PlaybackQueue
  findAlbum(track: Track): Album | null
  /** Loads and plays the queue's current entry. */
  startCurrentTrack(): void
  toast(message: string): void
  openRowMenu(row: QueuePanelEntryRow, position: MenuPosition): void
  onStateChange(): void
}

/** Bridges the pure queue model, the queue, transport playback, and the panel DOM. */
export class QueuePanelController {
  private readonly deps: QueuePanelControllerDeps
  private historyCollapsed = true
  private model: QueuePanelModel | null = null

  constructor(deps: QueuePanelControllerDeps) {
    this.deps = deps
    this.refresh()
  }

  refresh(): void {
    this.model = buildQueuePanelModel({
      snapshot: this.deps.queue.getSnapshot(),
      historyCollapsed: this.historyCollapsed,
      findAlbum: (track) => this.deps.findAlbum(track)
    })
    this.deps.panel.update(this.model)
  }

  open(): void {
    this.refresh()
    this.deps.panel.open()
    this.deps.onStateChange()
  }

  close(): void {
    this.deps.panel.close()
    this.deps.onStateChange()
  }

  toggle(): void {
    if (this.isOpen()) this.close()
    else this.open()
  }

  isOpen(): boolean {
    return this.deps.panel.isOpen()
  }

  handleClear(): void {
    if (this.deps.queue.clearUpcoming() > 0) {
      this.deps.toast(TOAST_MESSAGES.queueCleared)
    }
  }

  handlePlayEntry(entryId: string): void {
    if (!this.deps.queue.jumpTo(entryId)) return
    this.deps.startCurrentTrack()
  }

  handleRemoveEntry(entryId: string): void {
    if (!this.deps.queue.remove(entryId)) return
    this.deps.toast(TOAST_MESSAGES.removedFromQueue)
  }

  handleReorderEntry(entryId: string, slot: number): void {
    const model = this.model
    if (!model) return

    const destination = moveDestinationForSlot(
      model.currentIndex,
      model.upcomingEntryIds,
      entryId,
      slot
    )
    if (destination !== null) this.deps.queue.move(entryId, destination)
  }

  handleMoveEntry(entryId: string, direction: -1 | 1): void {
    const snapshot = this.deps.queue.getSnapshot()
    const entryIndex = snapshot.entries.findIndex((entry) => entry.entryId === entryId)
    if (entryIndex < 0) return

    const target = keyboardMoveTarget(
      entryIndex,
      snapshot.currentIndex,
      snapshot.entries.length,
      direction
    )
    if (target !== null) this.deps.queue.move(entryId, target)
  }

  handleToggleHistory(): void {
    this.historyCollapsed = !this.historyCollapsed
    this.refresh()
  }

  handleOpenRowMenu(row: QueuePanelEntryRow, position: MenuPosition): void {
    this.deps.openRowMenu(row, position)
  }

  /** Subscribes to queue snapshots; returns the unsubscribe function. */
  start(): () => void {
    return this.deps.queue.subscribe(() => this.refresh())
  }
}
