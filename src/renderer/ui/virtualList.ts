export interface VirtualListOptions<T> {
  container: HTMLElement
  rowHeight: number
  overscan?: number
  renderRow(item: T, index: number): HTMLElement
}

export interface SetItemsOptions {
  /** Keep the current scroll offset instead of jumping back to the top. */
  preserveScroll?: boolean
}

/**
 * Fixed-row virtual scroller. Only renders the visible rows plus an overscan buffer inside a
 * spacer whose height provides the real scrollbar range.
 */
export class VirtualList<T> {
  private readonly container: HTMLElement
  private readonly rowHeight: number
  private readonly overscan: number
  private readonly renderRow: (item: T, index: number) => HTMLElement
  private readonly spacer: HTMLDivElement
  private readonly windowElement: HTMLDivElement
  private readonly resizeObserver: ResizeObserver | null
  private items: readonly T[] = []
  private frame: number | null = null
  private renderedStart = -1
  private renderedEnd = -1

  constructor(options: VirtualListOptions<T>) {
    this.container = options.container
    this.rowHeight = options.rowHeight
    this.overscan = options.overscan ?? 4
    this.renderRow = options.renderRow

    this.spacer = document.createElement('div')
    this.spacer.className = 'virtual-list-spacer'
    this.spacer.style.position = 'relative'
    this.spacer.style.width = '100%'

    this.windowElement = document.createElement('div')
    this.windowElement.className = 'virtual-list-window'
    this.windowElement.style.position = 'absolute'
    this.windowElement.style.top = '0'
    this.windowElement.style.left = '0'
    this.windowElement.style.right = '0'

    this.container.replaceChildren(this.spacer)
    this.spacer.append(this.windowElement)
    this.container.addEventListener('scroll', this.handleScroll, { passive: true })
    this.resizeObserver = new ResizeObserver(() => this.render())
    this.resizeObserver.observe(this.container)
  }

  setItems(items: readonly T[], options: SetItemsOptions = {}): void {
    this.items = [...items]
    if (!options.preserveScroll) this.container.scrollTop = 0
    this.invalidate()
  }

  /** Re-renders the current window, e.g. when a row's playing state changed. */
  refresh(): void {
    this.invalidate()
  }

  destroy(): void {
    this.container.removeEventListener('scroll', this.handleScroll)
    this.resizeObserver?.disconnect()
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
    this.container.replaceChildren()
  }

  private readonly handleScroll = (): void => {
    if (this.frame !== null) return
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      this.render()
    })
  }

  private invalidate(): void {
    this.renderedStart = -1
    this.renderedEnd = -1
    this.render()
  }

  private render(): void {
    const total = this.items.length
    this.spacer.style.height = `${total * this.rowHeight}px`

    const height = this.container.clientHeight
    if (total === 0 || height <= 0) {
      this.windowElement.replaceChildren()
      this.renderedStart = -1
      this.renderedEnd = -1
      return
    }

    const visibleCount = Math.ceil(height / this.rowHeight)
    const start = Math.max(
      0,
      Math.min(total - 1, Math.floor(this.container.scrollTop / this.rowHeight) - this.overscan)
    )
    const end = Math.min(total, start + visibleCount + this.overscan * 2)

    if (start === this.renderedStart && end === this.renderedEnd) return

    this.renderedStart = start
    this.renderedEnd = end
    this.windowElement.style.transform = `translateY(${start * this.rowHeight}px)`

    const fragment = document.createDocumentFragment()
    for (let index = start; index < end; index += 1) {
      const row = this.renderRow(this.items[index], index)
      row.style.height = `${this.rowHeight}px`
      row.style.boxSizing = 'border-box'
      fragment.append(row)
    }
    this.windowElement.replaceChildren(fragment)
  }
}
