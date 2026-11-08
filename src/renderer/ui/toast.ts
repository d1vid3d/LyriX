export interface ToastOptions {
  container: HTMLElement
  /** Auto-dismiss delay in milliseconds. */
  duration?: number
}

const DEFAULT_DURATION = 2500

/** One non-blocking status message at a time; a new message replaces and restarts the timer. */
export class Toast {
  private readonly container: HTMLElement
  private readonly duration: number
  private readonly element: HTMLDivElement
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(options: ToastOptions) {
    this.container = options.container
    this.duration = options.duration ?? DEFAULT_DURATION

    this.element = document.createElement('div')
    this.element.className = 'toast'
    this.element.hidden = true
    this.container.append(this.element)
  }

  show(message: string): void {
    if (!message) return

    this.element.textContent = message
    this.element.hidden = false
    this.element.classList.add('toast--visible')

    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.hide()
    }, this.duration)
  }

  hide(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.element.classList.remove('toast--visible')
    this.element.hidden = true
  }

  isVisible(): boolean {
    return !this.element.hidden
  }

  destroy(): void {
    this.hide()
    this.element.remove()
  }
}
