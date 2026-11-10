export interface HistoryMetaInput {
  playCount: number
  lastPlayedAt: number
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Pure relative-time label; `nowMs` is always injected. */
export function formatRelativePlayedAt(timestamp: number, nowMs: number, locale?: string): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return ''

  const diff = Math.max(0, nowMs - timestamp)
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) {
    const minutes = Math.floor(diff / 60_000)
    return `${minutes} min ago`
  }

  const played = new Date(timestamp)
  const now = new Date(nowMs)
  if (sameLocalDay(played, now)) {
    return `Today ${pad(played.getHours())}:${pad(played.getMinutes())}`
  }

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (sameLocalDay(played, yesterday)) return 'Yesterday'

  return played.toLocaleDateString(locale)
}

export function formatHistoryMeta(item: HistoryMetaInput, nowMs: number, locale?: string): string {
  const plays = item.playCount === 1 ? '1 play' : `${item.playCount} plays`
  const relative = formatRelativePlayedAt(item.lastPlayedAt, nowMs, locale)
  return relative ? `${plays} · ${relative}` : plays
}
