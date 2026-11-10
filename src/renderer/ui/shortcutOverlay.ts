import { buildShortcutOverlayModel } from '../shortcuts/overlayModel'
import type { ShortcutDefinition } from '../shortcuts/shortcutRegistry'

/** Modal keyboard-shortcut reference generated from the registry. */
export class ShortcutOverlay {
  private readonly root: HTMLDivElement
  private readonly dialog: HTMLElement
  private readonly body: HTMLDivElement
  private readonly closeButton: HTMLButtonElement
  private readonly definitions: readonly ShortcutDefinition[]
  private readonly isMac: boolean
  private openState = false
  private opener: HTMLElement | null = null

  constructor(definitions: readonly ShortcutDefinition[], isMac: boolean) {
    this.definitions = definitions
    this.isMac = isMac

    this.root = document.createElement('div')
    this.root.id = 'shortcut-overlay'
    this.root.className = 'shortcut-overlay'
    this.root.hidden = true

    const backdrop = document.createElement('div')
    backdrop.className = 'shortcut-overlay__backdrop'

    this.dialog = document.createElement('section')
    this.dialog.className = 'shortcut-overlay__dialog'
    this.dialog.setAttribute('role', 'dialog')
    this.dialog.setAttribute('aria-modal', 'true')
    this.dialog.setAttribute('aria-labelledby', 'shortcut-overlay-title')
    this.dialog.tabIndex = -1

    const header = document.createElement('header')
    header.className = 'shortcut-overlay__header'

    const title = document.createElement('h2')
    title.id = 'shortcut-overlay-title'
    title.className = 'shortcut-overlay__title'
    title.textContent = 'Keyboard shortcuts'

    this.closeButton = document.createElement('button')
    this.closeButton.type = 'button'
    this.closeButton.className = 'shortcut-overlay__close'
    this.closeButton.textContent = '×'
    this.closeButton.setAttribute('aria-label', 'Close keyboard shortcuts')
    this.closeButton.title = 'Close'
    this.closeButton.addEventListener('click', () => this.close())

    this.body = document.createElement('div')
    this.body.className = 'shortcut-overlay__body'
    this.body.id = 'shortcut-overlay-body'

    header.append(title, this.closeButton)
    this.dialog.append(header, this.body)
    this.root.append(backdrop, this.dialog)
    document.body.append(this.root)

    this.root.addEventListener('pointerdown', (event) => {
      if (event.target === this.root || event.target === backdrop) this.close()
    })
    this.dialog.addEventListener('keydown', this.handleDialogKeydown)
    this.render()
  }

  open(): void {
    if (this.openState) return

    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    this.openState = true
    this.root.hidden = false
    this.root.classList.add('shortcut-overlay--open')
    this.dialog.focus({ preventScroll: true })
  }

  close(): void {
    if (!this.openState) return

    this.openState = false
    this.root.classList.remove('shortcut-overlay--open')
    this.root.hidden = true

    const opener = this.opener
    this.opener = null
    if (opener?.isConnected) opener.focus({ preventScroll: true })
  }

  toggle(): void {
    if (this.openState) this.close()
    else this.open()
  }

  isOpen(): boolean {
    return this.openState
  }

  destroy(): void {
    this.close()
    this.root.remove()
  }

  private render(): void {
    const groups = buildShortcutOverlayModel(this.definitions, { isMac: this.isMac })
    const fragment = document.createDocumentFragment()

    for (const group of groups) {
      const section = document.createElement('section')
      section.className = 'shortcut-overlay__group'

      const heading = document.createElement('h3')
      heading.className = 'shortcut-overlay__group-title'
      heading.textContent = group.category

      const list = document.createElement('dl')
      list.className = 'shortcut-overlay__list'

      for (const row of group.rows) {
        const term = document.createElement('dt')
        term.className = 'shortcut-overlay__label'
        term.textContent = row.label

        const description = document.createElement('dd')
        description.className = 'shortcut-overlay__chords'
        row.chords.forEach((chord, index) => {
          if (index > 0) description.append(' / ')
          const key = document.createElement('kbd')
          key.textContent = chord
          description.append(key)
        })

        list.append(term, description)
      }

      section.append(heading, list)
      fragment.append(section)
    }

    this.body.replaceChildren(fragment)
  }

  private readonly handleDialogKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return

    const focusable = [...this.dialog.querySelectorAll<HTMLElement>('button, [href]')].filter(
      (element) => element.getClientRects().length > 0
    )
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
