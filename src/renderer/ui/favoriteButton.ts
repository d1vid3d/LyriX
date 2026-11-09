const HEART_PATH =
  'M12 20.7s-7-4.4-9.2-8.3C.9 9.6 2 6.1 5.1 5.1c1.9-.6 3.9.2 6.7 2.8 2.8-2.6 4.8-3.4 6.7-2.8 3.1 1 4.2 4.5 2.3 7.3-2.2 3.9-9.2 8.3-9.2 8.3z'

function heartSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.classList.add('favorite-button__icon')

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', HEART_PATH)
  svg.append(path)
  return svg
}

export function updateFavoriteButton(button: HTMLButtonElement, isFavorite: boolean): void {
  const label = isFavorite ? 'Remove from Favorites' : 'Add to Favorites'
  button.setAttribute('aria-pressed', String(isFavorite))
  button.setAttribute('aria-label', label)
  button.title = label
  button.classList.toggle('favorite-button--on', isFavorite)
}

export function createFavoriteButton(
  trackId: string,
  isFavorite: boolean,
  onToggle: (trackId: string) => void
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'favorite-button'
  button.dataset.favoriteTrackId = trackId
  button.append(heartSvg())
  updateFavoriteButton(button, isFavorite)

  button.addEventListener('click', (event) => {
    event.stopPropagation()
    onToggle(trackId)
  })
  button.addEventListener('dblclick', (event) => event.stopPropagation())
  return button
}

/** Updates every rendered heart after a favorites state change. */
export function syncFavoriteButtons(
  root: ParentNode,
  isFavorite: (trackId: string) => boolean
): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-favorite-track-id]')) {
    const trackId = button.dataset.favoriteTrackId
    if (trackId) updateFavoriteButton(button, isFavorite(trackId))
  }
}
