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
export {
  findActiveLineIndex,
  findActiveLineIndexes,
  findActiveSegmentIndex,
  lineProgress,
  segmentProgress
} from './sync'
