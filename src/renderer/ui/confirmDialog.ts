export interface ConfirmDialogModel {
  title: string
  message: string
  confirmLabel: string
}

/** Small destructive-action confirmation modal; Escape/backdrop cancel. */
export class ConfirmDialog {
  private readonly root: HTMLDivElement
  private readonly dialog: HTMLElement
  private readonly title: HTMLHeadingElement
  private readonly message: HTMLParagraphElement
  private readonly confirmButton: HTMLButtonElement
  private openState = false
  private opener: HTMLElement | null = null
  private onConfirm: (() => void) | null = null

  constructor() {
    this.root = document.createElement('div')
    this.root.id = 'confirm-dialog'
    this.root.className = 'confirm-dialog'
    this.root.hidden = true

    const backdrop = document.createElement('div')
    backdrop.className = 'confirm-dialog__backdrop'

    this.dialog = document.createElement('section')
    this.dialog.className = 'confirm-dialog__dialog'
    this.dialog.setAttribute('role', 'dialog')
    this.dialog.setAttribute('aria-modal', 'true')
    this.dialog.setAttribute('aria-labelledby', 'confirm-dialog-title')
    this.dialog.tabIndex = -1

    const header = document.createElement('header')
    header.className = 'confirm-dialog__header'
    this.title = document.createElement('h2')
    this.title.id = 'confirm-dialog-title'
    this.title.className = 'confirm-dialog__title'
    header.append(this.title)

    this.message = document.createElement('p')
    this.message.className = 'confirm-dialog__message'

    const actions = document.createElement('div')
    actions.className = 'confirm-dialog__actions'

    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'confirm-dialog__cancel'
    cancel.textContent = 'Cancel'
    cancel.addEventListener('click', () => this.close())

    this.confirmButton = document.createElement('button')
    this.confirmButton.type = 'button'
    this.confirmButton.className = 'confirm-dialog__confirm'
    this.confirmButton.addEventListener('click', () => {
      const action = this.onConfirm
      this.close()
      action?.()
    })

    actions.append(cancel, this.confirmButton)
    this.dialog.append(header, this.message, actions)
    this.root.append(backdrop, this.dialog)
    document.body.append(this.root)

    this.root.addEventListener('pointerdown', (event) => {
      if (event.target === this.root || event.target === backdrop) this.close()
    })
    this.dialog.addEventListener('keydown', this.handleDialogKeydown)
  }

  show(model: ConfirmDialogModel, onConfirm: () => void): void {
    this.title.textContent = model.title
    this.message.textContent = model.message
    this.confirmButton.textContent = model.confirmLabel
    this.onConfirm = onConfirm

    if (!this.openState) {
      this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      this.openState = true
      this.root.hidden = false
      this.root.classList.add('confirm-dialog--open')
    }
    this.confirmButton.focus({ preventScroll: true })
  }

  close(): void {
    if (!this.openState) return

    this.openState = false
    this.onConfirm = null
    this.root.classList.remove('confirm-dialog--open')
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

  private readonly handleDialogKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return

    const focusable = [
      ...this.dialog.querySelectorAll<HTMLElement>('button:not(:disabled)')
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
