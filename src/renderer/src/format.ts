export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

export function smallCoverUrl(url: string): string {
  return `${url}?size=small`
}

export function createCover(url: string, alt: string, extraClass = ''): HTMLDivElement {
  const cover = document.createElement('div')
  cover.className = extraClass ? `cover ${extraClass}` : 'cover'

  const image = document.createElement('img')
  image.loading = 'lazy'
  image.decoding = 'async'
  image.alt = alt
  image.src = url
  image.addEventListener('error', () => {
    image.hidden = true
  })

  const fallback = document.createElement('span')
  fallback.className = 'cover-fallback'
  fallback.setAttribute('aria-hidden', 'true')
  fallback.textContent = '♪'

  cover.append(image, fallback)
  return cover
}

export function setCoverImage(image: HTMLImageElement, url: string | null, alt: string): void {
  if (!url) {
    image.hidden = true
    image.removeAttribute('src')
    image.alt = ''
    return
  }

  image.hidden = false
  image.alt = alt
  image.src = url
}

export function attachCoverFallbacks(images: readonly HTMLImageElement[]): void {
  for (const image of images) {
    image.addEventListener('error', () => {
      image.hidden = true
    })
  }
}
