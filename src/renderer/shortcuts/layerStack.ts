/** Pure priority stack for Escape handling. */

export interface EscapeLayer {
  id: string
  /** Higher closes first. */
  priority: number
  isOpen(): boolean
  close(): void
}

export const ESCAPE_LAYER_PRIORITIES = {
  contextMenu: 60,
  dataDisclaimer: 55,
  confirmDialog: 53,
  shortcutsOverlay: 50,
  lyricSourceMenu: 40,
  queuePanel: 30,
  nowPlaying: 20,
  searchClear: 10
} as const

/**
 * Owners register an open/close descriptor. Escape closes exactly one layer: the highest-priority
 * open layer, with later registrations winning ties.
 */
export class EscapeLayerStack {
  private layers: Array<{ layer: EscapeLayer; order: number }> = []
  private order = 0

  register(layer: EscapeLayer): () => void {
    const entry = { layer, order: this.order++ }
    this.layers.push(entry)
    return () => {
      this.layers = this.layers.filter((candidate) => candidate !== entry)
    }
  }

  closeTop(): boolean {
    const open = this.layers
      .filter((entry) => entry.layer.isOpen())
      .sort((a, b) => b.layer.priority - a.layer.priority || b.order - a.order)

    const top = open[0]
    if (!top) return false

    top.layer.close()
    return true
  }

  openLayerIds(): string[] {
    return this.layers
      .filter((entry) => entry.layer.isOpen())
      .sort((a, b) => b.layer.priority - a.layer.priority || b.order - a.order)
      .map((entry) => entry.layer.id)
  }
}
