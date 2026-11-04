import type { TranslationToggleModel } from '../lyrics/translationMenuModel'

export interface TranslationToggleCallbacks {
  onToggle(enabled: boolean): void
}

/**
 * Small translation on/off pill shown next to the lyric source chip. It receives a pure
 * model and reports the next pressed state; it has no controller knowledge.
 */
export class TranslationToggle {
  private readonly button: HTMLButtonElement
  private readonly callbacks: TranslationToggleCallbacks
  private pressed = false

  constructor(container: HTMLElement, callbacks: TranslationToggleCallbacks) {
    this.callbacks = callbacks

    this.button = document.createElement('button')
    this.button.type = 'button'
    this.button.className = 'translation-toggle'
    this.button.id = 'translation-toggle-button'
    this.button.setAttribute('aria-pressed', 'false')
    this.button.addEventListener('click', this.handleClick)

    container.append(this.button)
  }

  update(model: TranslationToggleModel): void {
    this.pressed = model.pressed
    this.button.textContent = model.label
    this.button.disabled = model.disabled
    this.button.title = model.tooltip
    this.button.setAttribute('aria-label', `${model.label}: ${model.tooltip}`)
    this.button.setAttribute('aria-pressed', String(model.pressed))
  }

  destroy(): void {
    this.button.removeEventListener('click', this.handleClick)
    this.button.remove()
  }

  private readonly handleClick = (): void => {
    this.callbacks.onToggle(!this.pressed)
  }
}
