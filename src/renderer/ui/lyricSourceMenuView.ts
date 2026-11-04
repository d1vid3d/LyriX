import type {
  SourceMenuBadge,
  SourceMenuModel,
  SourceMenuPreferenceOption,
  SourceMenuRow
} from '../lyrics/sourceMenuModel'

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

  const divider = el('div', 'lyric-source-divider')
  divider.setAttribute('role', 'separator')
  fragment.append(divider, createPreferenceGroup(model), createReload(model))

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
  const button = createMenuItem('menuitemradio')
  button.dataset.action = 'source'
  button.dataset.sourceId = row.id
  button.dataset.focusKey = `source:${row.id}`
  button.setAttribute('aria-checked', String(row.checked))

  if (row.disabled) {
    button.disabled = true
    button.setAttribute('aria-disabled', 'true')
  }

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

  if (model.reload.disabled) {
    button.disabled = true
    button.setAttribute('aria-disabled', 'true')
  }

  button.textContent = model.reload.label
  return button
}

function createMenuItem(role: 'menuitem' | 'menuitemradio'): HTMLButtonElement {
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
