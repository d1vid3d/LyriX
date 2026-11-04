import type {
  SourceMenuBadge,
  SourceMenuModel,
  SourceMenuPreferenceOption,
  SourceMenuRow
} from '../lyrics/sourceMenuModel'
import type { TranslationMenuModel } from '../lyrics/translationMenuModel'

/** Builds the popover body. The component owns events, focus, and open/close state. */
export function buildPopoverContent(model: SourceMenuModel): DocumentFragment {
  const fragment = document.createDocumentFragment()

  const title = el('div', 'lyric-source-title', model.title)
  title.id = 'lyric-source-popover-title'
  fragment.append(title)

  const sources = el('div', 'lyric-source-group')
  sources.setAttribute('role', 'group')
  sources.setAttribute('aria-label', model.groups.sources)
  sources.append(createAutoRow(model))
  for (const row of model.rows) sources.append(createSourceRow(row, model.inUseLabel))
  fragment.append(sources)

  fragment.append(
    createDivider(),
    createPreferenceGroup(model),
    createDivider(),
    createTranslationSection(model),
    createReload(model)
  )

  return fragment
}

function createAutoRow(model: SourceMenuModel): HTMLButtonElement {
  const button = createMenuItem('menuitemradio')
  button.classList.add('lyric-source-row--auto')
  button.dataset.action = 'auto'
  button.dataset.focusKey = 'auto'
  button.setAttribute('aria-checked', String(model.autoRow.checked))
  button.append(createRadio(model.autoRow.checked))

  const text = el('span', 'lyric-source-row-text')
  text.append(
    el('span', 'lyric-source-row-label', model.autoRow.label),
    el('span', 'lyric-source-row-detail', model.autoRow.detail)
  )
  button.append(text)
  return button
}

function createSourceRow(row: SourceMenuRow, inUseLabel: string): HTMLButtonElement {
  const button = createOptionRow(row, inUseLabel, 'source', `source:${row.id}`)
  button.dataset.sourceId = row.id
  return button
}

function createTranslationSection(model: SourceMenuModel): HTMLDivElement {
  const translation = model.translation
  const section = el('div', 'lyric-translation-section')
  section.setAttribute('role', 'group')
  section.setAttribute('aria-label', model.groups.translation)
  section.append(
    el('div', 'lyric-source-preference-title', translation.label),
    createTranslationSwitch(translation)
  )

  if (translation.switch.checked) {
    const options = el('div', 'lyric-translation-options')
    options.setAttribute('role', 'group')
    options.setAttribute('aria-label', model.groups.translationOptions)
    options.append(createTranslationAutoRow(translation))
    for (const row of translation.rows) {
      options.append(createTranslationRow(row, model.inUseLabel))
    }
    section.append(options)
  }

  return section
}

function createTranslationSwitch(translation: TranslationMenuModel): HTMLButtonElement {
  const button = createMenuItem('menuitemcheckbox')
  button.classList.add('lyric-translation-switch-row')
  button.dataset.action = 'translation-toggle'
  button.dataset.focusKey = 'translation-toggle'
  button.setAttribute('aria-checked', String(translation.switch.checked))
  if (translation.switch.disabled) disable(button)

  const control = el('span', 'lyric-translation-switch')
  control.setAttribute('aria-hidden', 'true')
  control.classList.toggle('lyric-translation-switch--on', translation.switch.checked)

  const text = el('span', 'lyric-source-row-text')
  text.append(el('span', 'lyric-source-row-label', translation.switch.label))
  if (translation.switch.hint) {
    text.append(el('span', 'lyric-translation-hint', translation.switch.hint))
  }

  button.append(control, text)
  return button
}

function createTranslationAutoRow(translation: TranslationMenuModel): HTMLButtonElement {
  const button = createMenuItem('menuitemradio')
  button.classList.add('lyric-source-row--auto')
  button.dataset.action = 'translation-auto'
  button.dataset.focusKey = 'translation-auto'
  button.setAttribute('aria-checked', String(translation.autoRow.checked))
  button.append(createRadio(translation.autoRow.checked))

  const text = el('span', 'lyric-source-row-text')
  text.append(
    el('span', 'lyric-source-row-label', translation.autoRow.label),
    el('span', 'lyric-source-row-detail', translation.autoRow.detail)
  )
  button.append(text)
  return button
}

function createTranslationRow(row: SourceMenuRow, inUseLabel: string): HTMLButtonElement {
  const button = createOptionRow(row, inUseLabel, 'translation', `translation:${row.id}`)
  button.dataset.translationId = row.id
  return button
}

function createOptionRow(
  row: SourceMenuRow,
  inUseLabel: string,
  action: string,
  focusKey: string
): HTMLButtonElement {
  const button = createMenuItem('menuitemradio')
  button.dataset.action = action
  button.dataset.focusKey = focusKey
  button.setAttribute('aria-checked', String(row.checked))
  if (row.disabled) disable(button)

  button.append(createRadio(row.checked))

  const text = el('span', 'lyric-source-row-text')
  const heading = el('span', 'lyric-source-row-heading')
  heading.append(el('span', 'lyric-source-row-label', row.label))
  if (row.detail) heading.append(el('span', 'lyric-source-row-detail', row.detail))
  text.append(heading)

  if (row.badges.length > 0) {
    const badges = el('span', 'lyric-source-badges')
    for (const badge of row.badges) badges.append(createBadge(badge))
    text.append(badges)
  }

  if (row.reason) text.append(el('span', 'lyric-source-reason', row.reason))
  button.append(text)

  if (row.inUse) button.append(el('span', 'lyric-source-in-use', inUseLabel))
  return button
}

function createPreferenceGroup(model: SourceMenuModel): HTMLDivElement {
  const group = el('div', 'lyric-source-preference')
  group.setAttribute('role', 'group')
  group.setAttribute('aria-label', model.groups.preference)
  group.append(el('div', 'lyric-source-preference-title', model.preference.label))

  const options = el('div', 'lyric-source-preference-options')
  for (const option of model.preference.options) options.append(createPreferenceOption(option))
  group.append(options)
  return group
}

function createPreferenceOption(option: SourceMenuPreferenceOption): HTMLButtonElement {
  const button = createMenuItem('menuitemradio')
  button.classList.add('lyric-source-preference-option')
  button.dataset.action = 'preference'
  button.dataset.preference = option.id
  button.dataset.focusKey = `preference:${option.id}`
  button.setAttribute('aria-checked', String(option.checked))
  button.append(createRadio(option.checked), el('span', 'lyric-source-row-label', option.label))
  return button
}

function createReload(model: SourceMenuModel): HTMLButtonElement {
  const button = createMenuItem('menuitem')
  button.classList.add('lyric-source-reload')
  button.dataset.action = 'reload'
  button.dataset.focusKey = 'reload'
  if (model.reload.disabled) disable(button)

  button.textContent = model.reload.label
  return button
}

function createDivider(): HTMLDivElement {
  const divider = el('div', 'lyric-source-divider')
  divider.setAttribute('role', 'separator')
  return divider
}

function createMenuItem(
  role: 'menuitem' | 'menuitemradio' | 'menuitemcheckbox'
): HTMLButtonElement {
  const button = el('button', 'lyric-source-row')
  button.type = 'button'
  button.setAttribute('role', role)
  button.dataset.menuItem = 'true'
  return button
}

function createRadio(checked: boolean): HTMLSpanElement {
  const radio = el('span', 'lyric-source-radio')
  radio.setAttribute('aria-hidden', 'true')
  radio.classList.toggle('lyric-source-radio--checked', checked)
  return radio
}

function createBadge(badge: SourceMenuBadge): HTMLSpanElement {
  const element = el('span', `lyric-source-badge lyric-source-badge--${badge.tone}`, badge.text)
  if (badge.title) element.title = badge.title
  return element
}

function disable(button: HTMLButtonElement): void {
  button.disabled = true
  button.setAttribute('aria-disabled', 'true')
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
