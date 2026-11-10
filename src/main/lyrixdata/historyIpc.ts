import { isValidTrackId } from '../lyrics/choices'
import { HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT } from './historyLog'

export interface HistoryGetInput {
  limit: number
}

/** Pure validation for `history:get`; bounded limit and no other fields. */
export function parseHistoryGetInput(value: unknown): HistoryGetInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { limit: HISTORY_DEFAULT_LIMIT }
  }

  const candidate = value as Record<string, unknown>
  const limit = candidate.limit
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return { limit: HISTORY_DEFAULT_LIMIT }
  }

  return {
    limit: Math.max(1, Math.min(Math.trunc(limit), HISTORY_MAX_LIMIT))
  }
}

export function parseHistoryRecordInput(value: unknown): string | null {
  return isValidTrackId(value) ? value : null
}

export function parseHistoryRecordingInput(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}
