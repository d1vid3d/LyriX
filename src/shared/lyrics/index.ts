export type {
  LyricDocument,
  LyricFormat,
  LyricLine,
  LyricMetadata,
  LyricParseOptions,
  LyricParser,
  LyricSegment,
  ResolvedLyricParseOptions
} from './types'
export { detectLyricFormat, parseLyrics } from './parse'
export { selectLyricSource } from './sources'
export type {
  LyricPreference,
  LyricSourceKind,
  LyricSourceOption,
  LyricSources,
  SelectedLyricSource,
  SelectLyricSourceContext
} from './sources'
export {
  findActiveLineIndex,
  findActiveLineIndexes,
  findActiveSegmentIndex,
  lineProgress,
  segmentProgress
} from './sync'
