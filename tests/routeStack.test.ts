import { describe, expect, it } from 'vitest'
import {
  backLabel,
  popRoute,
  pruneRoutes,
  pushRoute,
  topRoute
} from '../src/renderer/src/routeStack'
import type { DetailRoute } from '../src/renderer/src/routeStack'

const albumRoute: DetailRoute = { kind: 'album', albumId: 'a1' }
const artistRoute: DetailRoute = { kind: 'artist', artistName: 'Artist' }

describe('route stack', () => {
  it('returns the top route or null', () => {
    expect(topRoute([])).toBeNull()
    expect(topRoute([albumRoute, artistRoute])).toBe(artistRoute)
  })

  it('pushes without mutating the input stack', () => {
    const stack = [albumRoute]

    expect(pushRoute(stack, artistRoute)).toEqual([albumRoute, artistRoute])
    expect(stack).toEqual([albumRoute])
  })

  it('pops without mutating the input stack', () => {
    const stack = [albumRoute, artistRoute]

    expect(popRoute(stack)).toEqual([albumRoute])
    expect(popRoute([])).toEqual([])
    expect(stack).toEqual([albumRoute, artistRoute])
  })

  it('prunes invalid routes from the top only', () => {
    const otherArtistRoute: DetailRoute = { kind: 'artist', artistName: 'Other' }
    const stack = [albumRoute, artistRoute, otherArtistRoute]
    const isValid = (route: DetailRoute): boolean => route.kind === 'album'

    expect(pruneRoutes(stack, isValid)).toEqual([albumRoute])
    expect(stack).toEqual([albumRoute, artistRoute, otherArtistRoute])
  })

  it('keeps every route when the top is valid', () => {
    const stack = [albumRoute, artistRoute]

    expect(pruneRoutes(stack, () => true)).toEqual(stack)
  })

  it.each([
    ['albums', [], '← Albums'],
    ['artists', [], '← Artists'],
    ['tracks', [], '← Tracks'],
    ['albums', [albumRoute], '← Albums'],
    ['albums', [artistRoute, albumRoute], '← Artist'],
    ['tracks', [artistRoute, albumRoute], '← Artist']
  ] as const)('labels back navigation for %s with %j', (view, stack, expected) => {
    expect(backLabel(view, [...stack])).toBe(expected)
  })
})
