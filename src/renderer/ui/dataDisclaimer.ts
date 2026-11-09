import type { DataDisclaimerModel } from '../favorites/dataDisclaimerModel'

export interface DataDisclaimerOptions {
  onRetry(): Promise<boolean>
}

/** Modal for LyrixData write blocks; reuses the shortcut overlay's focus/escape conventions. */
export class DataDisclaimer {
  private readonly root: HTMLDivElement
  private readonly dialog: HTMLElement
  private readonly title: HTMLHeadingElement
  private readonly message: HTMLParagraphElement
  private readonly features: HTMLParagraphElement
  private readonly retryButton: HTMLButtonElement
  private readonly options: DataDisclaimerOptions
  private openState = false
  private busy = false
  private opener: HTMLElement | null = null
  private pendingAction: (() => void) | null = null

  constructor(options: DataDisclaimerOptions) {
    this.options = options

    this.root = document.createElement('div')
    this.root.id = 'data-disclaimer'
    this.root.className = 'data-disclaimer'
    this.root.hidden = true

    const backdrop = document.createElement('div')
    backdrop.className = 'data-disclaimer__backdrop'

    this.dialog = document.createElement('section')
    this.dialog.className = 'data-disclaimer__dialog'
    this.dialog.setAttribute('role', 'dialog')
    this.dialog.setAttribute('aria-modal', 'true')
    this.dialog.setAttribute('aria-labelledby', 'data-disclaimer-title')
    this.dialog.tabIndex = -1

    const header = document.createElement('header')
    header.className = 'data-disclaimer__header'
    this.title = document.createElement('h2')
    this.title.id = 'data-disclaimer-title'
    this.title.className = 'data-disclaimer__title'
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'data-disclaimer__close'
    close.textContent = '×'
    close.setAttribute('aria-label', 'Close')
    close.addEventListener('click', () => this.close())
    header.append(this.title, close)

    this.message = document.createElement('p')
    this.message.className = 'data-disclaimer__message'
    this.features = document.createElement('p')
    this.features.className = 'data-disclaimer__features'

    const actions = document.createElement('div')
    actions.className = 'data-disclaimer__actions'
    this.retryButton = document.createElement('button')
    this.retryButton.type = 'button'
    this.retryButton.className = 'data-disclaimer__retry action-primary'
    this.retryButton.textContent = 'Retry'
    this.retryButton.addEventListener('click', () => void this.retry())
    const dismiss = document.createElement('button')
    dismiss.type = 'button'
    dismiss.className = 'data-disclaimer__dismiss'
    dismiss.textContent = 'Close'
    dismiss.addEventListener('click', () => this.close())
    actions.append(this.retryButton, dismiss)

    this.dialog.append(header, this.message, this.features, actions)
    this.root.append(backdrop, this.dialog)
    document.body.append(this.root)

    this.root.addEventListener('pointerdown', (event) => {
      if (event.target === this.root || event.target === backdrop) this.close()
    })
    this.dialog.addEventListener('keydown', this.handleDialogKeydown)
  }

  show(model: DataDisclaimerModel, pendingAction: () => void): void {
    this.title.textContent = model.title
    this.message.textContent = model.message
    this.features.textContent =
      model.featureList.length > 0 ? `Saved with LyrixData: ${model.featureList.join(', ')}.` : ''
    this.features.hidden = model.featureList.length === 0
    this.retryButton.hidden = !model.canRetry
    this.pendingAction = pendingAction
    this.busy = false
    this.setBusy(false)

    if (!this.openState) {
      this.opener =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      this.openState = true
      this.root.hidden = false
      this.root.classList.add('data-disclaimer--open')
    }
    this.dialog.focus({ preventScroll: true })
  }

  close(): void {
    if (!this.openState) return

    this.openState = false
    this.pendingAction = null
    this.root.classList.remove('data-disclaimer--open')
    this.root.hidden = true

    const opener = this.opener
    this.opener = null
    if (opener?.isConnected) opener.focus({ preventScroll: true })
  }

  isOpen(): boolean {
    return this.openState
  }

  destroy(): void {
    this.close()
    this.root.remove()
  }

  private async retry(): Promise<void> {
    if (this.busy) return

    const pending = this.pendingAction
    this.busy = true
    this.setBusy(true)

    let ok = false
    try {
      ok = await this.options.onRetry()
    } finally {
      this.busy = false
      this.setBusy(false)
    }

    if (!ok) return
    this.close()
    pending?.()
  }

  private setBusy(busy: boolean): void {
    this.retryButton.disabled = busy
    this.retryButton.textContent = busy ? 'Retrying…' : 'Retry'
  }

  private readonly handleDialogKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return

    const focusable = [
      ...this.dialog.querySelectorAll<HTMLElement>('button:not([hidden]):not(:disabled)')
    ].filter((element) => element.getClientRects().length > 0)
    if (focusable.length === 0) {
      event.preventDefault()
      this.dialog.focus({ preventScroll: true })
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus({ preventScroll: true })
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus({ preventScroll: true })
    }
  }
}
