import { basename, extname } from 'node:path'
import type {
  LyricPreference,
  LyricSourceOption,
  LyricSources
} from '../../shared/lyrics/sources'
import { readEmbeddedLyrics } from './embedded'
import { findSidecars } from './sidecar'

export interface LyricsTrack {
  id: string
  filePath: string
}

export type LyricSourceProvider = (track: LyricsTrack) => Promise<LyricSourceOption[]>

export interface LyricSourcesContext {
  savedChoice: string | null
  savedTranslationChoice: string | null
  preference: LyricPreference
}

/** Adding a provider that fits the existing kinds only requires one entry here. */
const PROVIDERS: readonly LyricSourceProvider[] = [embeddedProvider, sidecarProvider]

export function expectedSidecarName(trackFilePath: string): string {
  return `${basename(trackFilePath, extname(trackFilePath))}.lrc`
}

/**
 * Runs every provider in order, tolerating individual failures, and returns the canonical option
 * list: embedded, exact sidecar, then variant sidecars alphabetically.
 */
export async function getLyricSources(
  track: LyricsTrack,
  context: LyricSourcesContext
): Promise<LyricSources> {
  const expected = expectedSidecarName(track.filePath)
  const collected: LyricSourceOption[] = []

  for (const provider of PROVIDERS) {
    try {
      collected.push(...(await provider(track)))
    } catch (error) {
      console.warn(`[lyrics] ${provider.name || 'provider'} failed for ${track.id}`, error)
    }
  }

  const embedded = collected.find((option) => option.kind === 'embedded') ?? missingEmbedded()
  const sidecars = collected.filter((option) => option.kind === 'sidecar')
  const exactId = `sidecar:${expected}`
  const exact = sidecars.find((option) => option.id === exactId) ?? missingSidecar(exactId)
  const variants = sidecars
    .filter((option) => option.id !== exactId)
    .sort((a, b) => (a.detail ?? a.id).localeCompare(b.detail ?? b.id))

  return {
    trackId: track.id,
    options: [embedded, exact, ...variants],
    savedChoice: context.savedChoice,
    savedTranslationChoice: context.savedTranslationChoice,
    preference: context.preference,
    expectedSidecarName: expected
  }
}

async function embeddedProvider(track: LyricsTrack): Promise<LyricSourceOption[]> {
  const embedded = await readEmbeddedLyrics(track.filePath)
  if (!embedded || embedded.text.trim() === '') return []

  return [
    {
      id: 'embedded',
      kind: 'embedded',
      label: 'Embedded tag',
      detail: embedded.tag,
      available: true,
      text: embedded.text,
      variant: null
    }
  ]
}

async function sidecarProvider(track: LyricsTrack): Promise<LyricSourceOption[]> {
  const expected = expectedSidecarName(track.filePath)
  const sidecars = await findSidecars(track.filePath)

  return sidecars.map((sidecar) => ({
    id: sidecar.exact ? `sidecar:${expected}` : `sidecar:${sidecar.fileName}`,
    kind: 'sidecar' as const,
    label: sidecar.exact ? 'Sidecar file' : `Sidecar (${sidecar.variant ?? ''})`,
    detail: sidecar.fileName,
    available: true,
    text: sidecar.text,
    variant: sidecar.exact ? null : sidecar.variant
  }))
}

function missingEmbedded(): LyricSourceOption {
  return {
    id: 'embedded',
    kind: 'embedded',
    label: 'Embedded tag',
    detail: null,
    available: false,
    text: null,
    variant: null
  }
}

function missingSidecar(id: string): LyricSourceOption {
  return {
    id,
    kind: 'sidecar',
    label: 'Sidecar file',
    detail: null,
    available: false,
    text: null,
    variant: null
  }
}
