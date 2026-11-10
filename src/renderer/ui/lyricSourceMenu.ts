import type { LyricPreference } from '../../shared/lyrics/sources'
import { firstEnabledIndex, lastEnabledIndex, nextEnabledIndex } from '../lyrics/sourceMenuModel'
import type { SourceMenuModel } from '../lyrics/sourceMenuModel'
import { buildPopoverContent } from './lyricSourceMenuView'

export interface LyricSourceMenuCallbacks {
  onSelect(sourceId: string | null): void
  onPreference(preference: LyricPreference): void
  onTranslationToggle(enabled: boolean): void
  onTranslationSelect(id: string | null): void
  onReload(): void
  /** Called before the popover opens so another floating menu can close itself. */
  onOpen?(): void
}

const MENU_ITEM_SELECTOR = '[data-menu-item]'

/**
 * Renders the lyric source chip and popover. It receives a pure view model and emits user
 * choices through callbacks; it has no knowledge of the lyric controller.
 */
export class LyricSourceMenu {
  private readonly container: HTMLElement
  private readonly callbacks: LyricSourceMenuCallbacks
  private readonly trigger: HTMLButtonElement
  private readonly triggerLabel: HTMLSpanElement
  private readonly triggerAuto: HTMLSpanElement
  private readonly popover: HTMLDivElement

  private model: SourceMenuModel | null = null
  private openState = false

  constructor(container: HTMLElement, callbacks: LyricSourceMenuCallbacks) {
    this.container = container
    this.callbacks = callbacks

    this.triggerLabel = el('span', 'lyric-source-trigger-label')
    this.triggerAuto = el('span', 'lyric-source-trigger-auto')
    this.triggerAuto.hidden = true

    const chevron = el('span', 'lyric-source-trigger-chevron', '▾')
    chevron.setAttribute('aria-hidden', 'true')

    this.trigger = el('button', 'lyric-source-trigger')
    this.trigger.type = 'button'
    this.trigger.id = 'lyric-source-trigger'
    this.trigger.setAttribute('aria-haspopup', 'menu')
    this.trigger.setAttribute('aria-expanded', 'false')
    this.trigger.setAttribute('aria-controls', 'lyric-source-popover')
    this.trigger.append(this.triggerLabel, this.triggerAuto, chevron)

    this.popover = el('div', 'lyric-source-popover')
    this.popover.id = 'lyric-source-popover'
    this.popover.setAttribute('role', 'menu')
    this.popover.setAttribute('aria-labelledby', 'lyric-source-popover-title')
    this.popover.tabIndex = -1
    this.popover.hidden = true

    this.container.append(this.trigger, this.popover)
    this.container.addEventListener('keydown', this.handleKeydown)
    this.trigger.addEventListener('click', this.handleTriggerClick)
    this.popover.addEventListener('click', this.handlePopoverClick)
    document.addEventListener('pointerdown', this.handleDocumentPointerDown, true)
  }

  update(model: SourceMenuModel): void {
    this.model = model
    this.renderTrigger()

    if (this.openState) this.renderPopover()
  }

  open(): void {
    if (this.openState || !this.model) return

    this.callbacks.onOpen?.()
    this.openState = true
    this.popover.hidden = false
    this.trigger.setAttribute('aria-expanded', 'true')
    this.renderPopover()
    this.focusEdge('first')
  }

  close(): void {
    if (!this.openState) return

    this.openState = false
    this.popover.hidden = true
    this.trigger.setAttribute('aria-expanded', 'false')
  }

  /** Escape closes the source menu and returns focus to its chip. */
  closeAndFocusTrigger(): void {
    this.close()
    this.trigger.focus({ preventScroll: true })
  }

  isOpen(): boolean {
    return this.openState
  }

  destroy(): void {
    this.close()
    document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true)
    this.container.removeEventListener('keydown', this.handleKeydown)
    this.trigger.removeEventListener('click', this.handleTriggerClick)
    this.popover.removeEventListener('click', this.handlePopoverClick)
    this.container.replaceChildren()
  }

  private renderTrigger(): void {
    const model = this.model
    if (!model) return

    this.triggerLabel.textContent = model.trigger.label
    this.triggerAuto.textContent = model.trigger.autoTag ?? ''
    this.triggerAuto.hidden = model.trigger.autoTag === null
    this.trigger.disabled = model.trigger.disabled
    this.trigger.setAttribute('aria-busy', String(model.trigger.loading))
  }

  private renderPopover(): void {
    const model = this.model
    if (!model) return

    const focusKey = this.currentFocusKey()
    this.popover.replaceChildren(buildPopoverContent(model))
    if (this.openState) this.restoreFocus(focusKey)
  }

  private getMenuItems(): HTMLElement[] {
    return Array.from(this.popover.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR))
  }

  private moveFocus(step: 1 | -1): void {
    const items = this.getMenuItems()
    const enabled = items.map((item) => !item.hasAttribute('disabled'))
    const current = items.indexOf(document.activeElement as HTMLElement)
    this.focusIndex(items, nextEnabledIndex(enabled, current, step))
  }

  private focusEdge(edge: 'first' | 'last'): void {
    const items = this.getMenuItems()
    const enabled = items.map((item) => !item.hasAttribute('disabled'))
    const index = edge === 'first' ? firstEnabledIndex(enabled) : lastEnabledIndex(enabled)
    this.focusIndex(items, index)
  }

  private focusIndex(items: HTMLElement[], index: number): void {
    if (index >= 0) {
      const item = items[index]
      if (item) {
        item.focus()
        return
      }
    }

    this.popover.focus()
  }

  private currentFocusKey(): string | null {
    const active = document.activeElement
    if (!(active instanceof HTMLElement) || !this.popover.contains(active)) return null
    return active.dataset.focusKey ?? null
  }

  private restoreFocus(focusKey: string | null): void {
    if (!focusKey) return

    const items = this.getMenuItems()
    const target = items.find(
      (item) => item.dataset.focusKey === focusKey && !item.hasAttribute('disabled')
    )

    if (target) {
      target.focus()
      return
    }

    this.focusEdge('first')
  }

  private readonly handleTriggerClick = (): void => {
    if (this.trigger.disabled) return

    if (this.openState) this.close()
    else this.open()
  }

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (this.openState) {
      switch (event.key) {
        case 'Tab':
          this.close()
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
        default:
          return
      }
    }

    if (event.target !== this.trigger) return

    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault()
      this.open()
    }
  }

  private readonly handlePopoverClick = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof Element)) return

    const item = target.closest<HTMLElement>(MENU_ITEM_SELECTOR)
    if (!item || item.hasAttribute('disabled')) return

    switch (item.dataset.action) {
      case 'auto':
        this.callbacks.onSelect(null)
        this.close()
        this.trigger.focus()
        return
      case 'source': {
        const sourceId = item.dataset.sourceId
        if (sourceId) {
          this.callbacks.onSelect(sourceId)
          this.close()
          this.trigger.focus()
        }
        return
      }
      case 'preference': {
        const preference = item.dataset.preference
        if (preference === 'sidecar' || preference === 'embedded') {
          this.callbacks.onPreference(preference)
        }
        return
      }
      case 'translation-toggle': {
        const checked = item.getAttribute('aria-checked') === 'true'
        this.callbacks.onTranslationToggle(!checked)
        return
      }
      case 'translation-auto':
        this.callbacks.onTranslationSelect(null)
        this.close()
        this.trigger.focus()
        return
      case 'translation': {
        const translationId = item.dataset.translationId
        if (translationId) {
          this.callbacks.onTranslationSelect(translationId)
          this.close()
          this.trigger.focus()
        }
        return
      }
      case 'reload':
        this.callbacks.onReload()
        return
      default:
        return
    }
  }

  private readonly handleDocumentPointerDown = (event: PointerEvent): void => {
    if (!this.openState) return

    const target = event.target
    if (target instanceof Node && this.container.contains(target)) return

    this.close()
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  element.className = className
  if (text !== undefined) element.textContent = text
  return element
}
