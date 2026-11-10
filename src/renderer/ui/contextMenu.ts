import { firstEnabledIndex, lastEnabledIndex, nextEnabledIndex } from '../lyrics/sourceMenuModel'

/** Base item shape for every menu. `submenu` is reserved for a later submenu feature. */
export interface MenuItem {
  id: string
  label: string
  disabled?: boolean
  separator?: boolean
  hint?: string
  submenu?: readonly MenuItem[]
}

export type MenuPosition = { x: number; y: number } | { anchor: HTMLElement }

export interface MenuShowOptions {
  /** Called exactly once when this menu closes. */
  onClose?(): void
  /** Extra scroll container to watch; the nearest scroll parent of an anchor is watched too. */
  scrollTarget?: HTMLElement | null
}

export interface ContextMenuOptions<Item extends MenuItem> {
  onSelect(item: Item): void
  /** Called before a new menu opens, so another popover can close itself. */
  onOpen?(): void
}

const EDGE_PADDING = 8
const ANCHOR_GAP = 4

/**
 * Generic floating menu. It only understands menu items and positioning; callers decide what the
 * selection means. Descendant/section popovers (such as the lyric source menu) coordinate through
 * the injected `onOpen` callback.
 */
export class ContextMenu<Item extends MenuItem = MenuItem> {
  private readonly options: ContextMenuOptions<Item>
  private readonly element: HTMLDivElement
  private items: readonly Item[] = []
  private openState = false
  private origin: HTMLElement | null = null
  private showOptions: MenuShowOptions = {}
  private scrollTarget: HTMLElement | null = null

  constructor(options: ContextMenuOptions<Item>) {
    this.options = options

    this.element = document.createElement('div')
    this.element.className = 'context-menu'
    this.element.setAttribute('role', 'menu')
    this.element.setAttribute('aria-label', 'Context menu')
    this.element.hidden = true
    document.body.append(this.element)

    this.element.addEventListener('keydown', this.handleKeydown)
    this.element.addEventListener('click', this.handleClick)
    document.addEventListener('pointerdown', this.handleDocumentPointerDown, true)
  }

  show(items: readonly Item[], position: MenuPosition, options: MenuShowOptions = {}): void {
    if (this.openState) this.close(false)

    this.options.onOpen?.()

    this.items = items
    this.showOptions = options
    this.origin =
      'anchor' in position
        ? position.anchor
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null

    this.element.replaceChildren(...this.buildItems(items))
    this.element.hidden = false
    this.openState = true

    this.positionAt(position)
    this.bindTransientListeners(position, options)
    this.focusEdge('first')
    this.element.classList.add('context-menu--open')
  }

  close(restoreFocus = false): void {
    if (!this.openState) return

    this.openState = false
    this.element.hidden = true
    this.element.classList.remove('context-menu--open')
    this.unbindTransientListeners()

    const options = this.showOptions
    const origin = this.origin
    this.showOptions = {}
    this.origin = null

    options.onClose?.()

    if (restoreFocus && origin && origin.isConnected && origin.getClientRects().length > 0) {
      origin.focus({ preventScroll: true })
    }
  }

  isOpen(): boolean {
    return this.openState
  }

  destroy(): void {
    this.close(false)
    document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true)
    this.element.removeEventListener('keydown', this.handleKeydown)
    this.element.removeEventListener('click', this.handleClick)
    this.element.remove()
  }

  private buildItems(items: readonly Item[]): HTMLElement[] {
    return items.map((item, index) => {
      if (item.separator) {
        const separator = document.createElement('div')
        separator.className = 'context-menu__separator'
        separator.setAttribute('role', 'separator')
        return separator
      }

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'context-menu__item'
      button.setAttribute('role', 'menuitem')
      button.dataset.menuItem = ''
      button.dataset.index = String(index)
      if (item.disabled) {
        button.disabled = true
        button.setAttribute('aria-disabled', 'true')
      }
      if (item.submenu && item.submenu.length > 0) {
        button.setAttribute('aria-haspopup', 'menu')
        button.setAttribute('aria-expanded', 'false')
      }

      const label = document.createElement('span')
      label.className = 'context-menu__label'
      label.textContent = item.label

      const hint = document.createElement('span')
      hint.className = 'context-menu__hint'
      hint.textContent = item.hint ?? ''
      hint.hidden = !item.hint

      button.append(label, hint)
      return button
    })
  }

  private positionAt(position: MenuPosition): void {
    this.element.style.setProperty('--context-menu-x', '0px')
    this.element.style.setProperty('--context-menu-y', '0px')

    const rect = this.element.getBoundingClientRect()
    let left: number
    let top: number

    if ('anchor' in position) {
      const anchor = position.anchor.getBoundingClientRect()
      left = anchor.left
      top = anchor.bottom + ANCHOR_GAP
      if (top + rect.height > window.innerHeight - EDGE_PADDING) {
        top = anchor.top - rect.height - ANCHOR_GAP
      }
    } else {
      left = position.x
      top = position.y
    }

    left = Math.min(
      Math.max(left, EDGE_PADDING),
      Math.max(EDGE_PADDING, window.innerWidth - rect.width - EDGE_PADDING)
    )
    top = Math.min(
      Math.max(top, EDGE_PADDING),
      Math.max(EDGE_PADDING, window.innerHeight - rect.height - EDGE_PADDING)
    )

    this.element.style.setProperty('--context-menu-x', `${left}px`)
    this.element.style.setProperty('--context-menu-y', `${top}px`)
  }

  private bindTransientListeners(position: MenuPosition, options: MenuShowOptions): void {
    window.addEventListener('blur', this.handleWindowBlur)
    window.addEventListener('resize', this.handleWindowResize)

    const anchor = 'anchor' in position ? position.anchor : null
    this.scrollTarget = options.scrollTarget ?? (anchor ? findScrollParent(anchor) : null)
    this.scrollTarget?.addEventListener('scroll', this.handleOriginScroll, {
      passive: true
    })
  }

  private unbindTransientListeners(): void {
    window.removeEventListener('blur', this.handleWindowBlur)
    window.removeEventListener('resize', this.handleWindowResize)
    this.scrollTarget?.removeEventListener('scroll', this.handleOriginScroll)
    this.scrollTarget = null
  }

  private getItemButtons(): HTMLButtonElement[] {
    return Array.from(this.element.querySelectorAll<HTMLButtonElement>('[data-menu-item]'))
  }

  private moveFocus(step: 1 | -1): void {
    const buttons = this.getItemButtons()
    const enabled = buttons.map(
      (button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true'
    )
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    this.focusIndex(buttons, nextEnabledIndex(enabled, current, step))
  }

  private focusEdge(edge: 'first' | 'last'): void {
    const buttons = this.getItemButtons()
    const enabled = buttons.map(
      (button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true'
    )
    const index = edge === 'first' ? firstEnabledIndex(enabled) : lastEnabledIndex(enabled)
    this.focusIndex(buttons, index)
  }

  private focusIndex(buttons: HTMLButtonElement[], index: number): void {
    const button = index >= 0 ? buttons[index] : undefined
    if (button) button.focus({ preventScroll: true })
    else this.element.focus({ preventScroll: true })
  }

  private activateFocused(): void {
    const active = document.activeElement
    if (active instanceof HTMLButtonElement && this.element.contains(active)) active.click()
  }

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (!this.openState) return

    switch (event.key) {
      case 'Tab':
        this.close(false)
        return
      case 'ArrowDown':
        event.preventDefault()
        this.moveFocus(1)
        return
      case 'ArrowUp':
        event.preventDefault()
        this.moveFocus(-1)
        return
      case 'Home':
        event.preventDefault()
        this.focusEdge('first')
        return
      case 'End':
        event.preventDefault()
        this.focusEdge('last')
        return
      case 'Enter':
      case ' ':
        event.preventDefault()
        this.activateFocused()
        return
      default:
        return
    }
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof Element)) return

    const button = target.closest<HTMLButtonElement>('[data-menu-item]')
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return

    const index = Number(button.dataset.index)
    const item = this.items[index]
    if (!item) return

    this.close(true)
    this.options.onSelect(item)
  }

  private readonly handleDocumentPointerDown = (event: PointerEvent): void => {
    if (!this.openState) return
    const target = event.target
    if (target instanceof Node && this.element.contains(target)) return
    this.close(false)
  }

  private readonly handleWindowBlur = (): void => {
    this.close(false)
  }

  private readonly handleWindowResize = (): void => {
    this.close(false)
  }

  private readonly handleOriginScroll = (): void => {
    this.close(false)
  }
}

function findScrollParent(element: HTMLElement): HTMLElement | null {
  let node = element.parentElement
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node)
    if (/(auto|scroll|overlay)/.test(style.overflowY)) return node
    node = node.parentElement
  }
  return null
}
