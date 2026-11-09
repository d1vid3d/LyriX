import { isValidTrackId } from '../lyrics/choices'

export const MAX_FAVORITE_IDS_PER_CALL = 1000

export interface FavoriteSetInput {
  trackIds: string[]
  favorite: boolean
}

/** Pure validation for `favorites:set`; invalid input never reaches the store. */
export function parseFavoriteSetInput(value: unknown): FavoriteSetInput | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null

  const candidate = value as Record<string, unknown>
  if (typeof candidate.favorite !== 'boolean') return null
  if (!Array.isArray(candidate.trackIds)) return null
  if (candidate.trackIds.length > MAX_FAVORITE_IDS_PER_CALL) return null

  const trackIds: string[] = []
  for (const id of candidate.trackIds) {
    if (!isValidTrackId(id)) return null
    if (!trackIds.includes(id)) trackIds.push(id)
  }

  return { trackIds, favorite: candidate.favorite }
}
