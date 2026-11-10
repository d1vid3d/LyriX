import type { LibraryView } from '../library/query'

export type DetailRoute =
  { kind: 'album'; albumId: string } | { kind: 'artist'; artistName: string }

export function topRoute(stack: readonly DetailRoute[]): DetailRoute | null {
  return stack.length > 0 ? stack[stack.length - 1] : null
}

export function pushRoute(stack: readonly DetailRoute[], route: DetailRoute): DetailRoute[] {
  return [...stack, route]
}

export function popRoute(stack: readonly DetailRoute[]): DetailRoute[] {
  return stack.length > 0 ? stack.slice(0, -1) : []
}

/** Drops invalid routes from the top until the first valid one, matching the UI back stack. */
export function pruneRoutes(
  stack: readonly DetailRoute[],
  isValid: (route: DetailRoute) => boolean
): DetailRoute[] {
  let end = stack.length
  while (end > 0 && !isValid(stack[end - 1])) end -= 1
  return end === stack.length ? [...stack] : stack.slice(0, end)
}

export function backLabel(activeView: LibraryView, stack: readonly DetailRoute[]): string {
  const parent = stack[stack.length - 2]
  if (parent?.kind === 'artist') return '← Artist'
  if (activeView === 'artists') return '← Artists'
  if (activeView === 'tracks') return '← Tracks'
  return '← Albums'
}
