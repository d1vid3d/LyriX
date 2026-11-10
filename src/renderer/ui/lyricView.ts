import {
  findActiveLineIndex,
  findActiveLineIndexes,
  findActiveSegmentIndex,
  segmentProgress
} from '../../shared/lyrics'
import type { LyricDocument, LyricLine } from '../../shared/lyrics'
import type { PlaybackEngine } from '../player/engine'
import { groupSegments } from '../lyrics/segmentGroups'
import { isLanguageTag } from '../lyrics/translationLabels'
import { translationTextForLine } from '../lyrics/translationText'

const SEGMENT_CLASSES = ['lyric-seg--sung', 'lyric-seg--active', 'lyric-seg--upcoming'] as const

const MANUAL_SCROLL_PAUSE_MS = 4000

interface LineFlags {
  current: boolean
  active: boolean
  past: boolean
  upcoming: boolean
  ended: boolean
}

interface SegmentFlags {
  sung: boolean
  active: boolean
  upcoming: boolean
}

export interface LyricViewOptions {
  scroller: HTMLElement
  lines: HTMLElement
  status: HTMLElement
  engine: Pick<PlaybackEngine, 'getPosition' | 'seek'>
}

/**
 * Builds lyric DOM once per document and applies sync state with class toggles. The playback
 * position is read only from the engine, never from the audio element.
 */
export class LyricView {
  private readonly scroller: HTMLElement
  private readonly linesElement: HTMLElement
  private readonly statusElement: HTMLElement
  private readonly engine: Pick<PlaybackEngine, 'getPosition' | 'seek'>

  private doc: LyricDocument | null = null
  private translationKey: string | null = null
  private translationVariant: string | null = null
  private lineElements: HTMLElement[] = []
  private segmentElements = new Map<number, HTMLSpanElement[]>()
  private lineFlags: Array<LineFlags | null> = []
  private segmentFlags = new Map<number, Array<SegmentFlags | null>>()
  private activeSegmentElements = new Map<number, HTMLSpanElement | null>()
  private activeSegmentProgress = new Map<number, number>()
  private previousActiveLines = new Set<number>()

  private running = false
  private frame: number | null = null
  private lastPrimary = -1
  private pendingScrollIndex: number | null = null
  private pausedUntil = 0

  constructor(options: LyricViewOptions) {
    this.scroller = options.scroller
    this.linesElement = options.lines
    this.statusElement = options.status
    this.engine = options.engine

    this.linesElement.addEventListener('click', this.handleLineClick)
    this.linesElement.addEventListener('keydown', this.handleLineKeydown)
    this.scroller.addEventListener('wheel', this.handleManualScroll, { passive: true })
    this.scroller.addEventListener('touchstart', this.handleManualScroll, { passive: true })
    this.scroller.addEventListener('touchmove', this.handleManualScroll, { passive: true })
    this.scroller.addEventListener('pointerdown', this.handleManualScroll)
  }

  /** Rebuilds only when the document instance changes. */
  setDocument(
    doc: LyricDocument,
    translationKey: string | null = null,
    translationVariant: string | null = null
  ): void {
    const changed = this.doc !== doc
    this.doc = doc
    this.translationKey = translationKey
    this.translationVariant = translationVariant

    if (changed) {
      this.build(doc)
      this.resetSyncState()
    }

    this.showLines()

    if (this.running) {
      this.resetSyncState()
      if (doc.timed) {
        // A rebuild (track change, translation toggle, or source switch) keeps the current
        // line centered immediately; only ordinary line changes scroll smoothly.
        this.sync(true)
        this.startFrame()
      } else {
        this.cancelFrame()
      }
    }
  }

  showMessage(message: string): void {
    this.stop()
    this.statusElement.textContent = message
    this.statusElement.hidden = false
    this.scroller.hidden = true
  }

  start(): void {
    if (this.running) return

    this.running = true
    this.resetSyncState()

    if (this.doc && this.doc.timed) {
      this.sync(true)
      this.startFrame()
    }
  }

  stop(): void {
    this.running = false
    this.cancelFrame()
  }

  destroy(): void {
    this.stop()
    this.linesElement.removeEventListener('click', this.handleLineClick)
    this.linesElement.removeEventListener('keydown', this.handleLineKeydown)
    this.scroller.removeEventListener('wheel', this.handleManualScroll)
    this.scroller.removeEventListener('touchstart', this.handleManualScroll)
    this.scroller.removeEventListener('touchmove', this.handleManualScroll)
    this.scroller.removeEventListener('pointerdown', this.handleManualScroll)
    this.linesElement.replaceChildren()
    this.doc = null
  }

  private showLines(): void {
    this.statusElement.hidden = true
    this.statusElement.textContent = ''
    this.scroller.hidden = false
  }

  private build(doc: LyricDocument): void {
    const fragment = document.createDocumentFragment()
    this.lineElements = []
    this.segmentElements.clear()

    for (const line of doc.lines) {
      const lineElement = document.createElement('div')
      lineElement.className = 'lyric-line'
      lineElement.dataset.index = String(line.index)

      if (line.agent !== undefined) lineElement.dataset.agent = line.agent

      if (doc.timed) {
        lineElement.classList.add('lyric-line--seekable')
        lineElement.tabIndex = 0
        lineElement.setAttribute('role', 'button')
      }

      if (line.segments && line.segments.length > 0) {
        this.buildSegments(lineElement, line)
      } else {
        lineElement.textContent = line.text
      }

      this.appendTranslation(lineElement, line)

      this.lineElements.push(lineElement)
      fragment.append(lineElement)
    }

    this.linesElement.classList.toggle('lyric-lines--static', !doc.timed)
    this.linesElement.replaceChildren(fragment)
  }

  private appendTranslation(lineElement: HTMLElement, line: LyricLine): void {
    const text = translationTextForLine(line, this.translationKey)
    if (text === null) return

    const translation = document.createElement('div')
    translation.className = 'lyric-translation'
    translation.textContent = text

    if (isLanguageTag(this.translationVariant)) {
      translation.lang = this.translationVariant
    }

    lineElement.append(translation)
  }

  private buildSegments(lineElement: HTMLElement, line: LyricLine): void {
    const groups = groupSegments(line.segments ?? [])
    const elements: HTMLSpanElement[] = []
    let segmentIndex = 0

    groups.forEach((group, groupIndex) => {
      if (groupIndex > 0) lineElement.append(document.createTextNode(' '))

      const word = document.createElement('span')
      word.className = 'lyric-word'

      for (const segment of group.segments) {
        const element = document.createElement('span')
        element.className = 'lyric-seg'
        element.dataset.segmentIndex = String(segmentIndex)
        element.textContent = segment.text
        segmentIndex += 1

        word.append(element)
        elements.push(element)
      }

      lineElement.append(word)
    })

    this.segmentElements.set(line.index, elements)
  }

  private resetSyncState(): void {
    this.lineFlags = this.lineElements.map(() => null)
    this.segmentFlags.clear()
    this.activeSegmentElements.clear()
    this.activeSegmentProgress.clear()
    this.previousActiveLines.clear()

    for (const [lineIndex, elements] of this.segmentElements) {
      this.segmentFlags.set(
        lineIndex,
        elements.map(() => null)
      )
    }

    this.lastPrimary = -1
    this.pendingScrollIndex = null
  }

  private startFrame(): void {
    if (this.frame !== null) return
    this.frame = requestAnimationFrame(this.tick)
  }

  private cancelFrame(): void {
    if (this.frame === null) return
    cancelAnimationFrame(this.frame)
    this.frame = null
  }

  private readonly tick = (): void => {
    this.frame = null
    if (!this.running) return

    this.sync()
    this.frame = requestAnimationFrame(this.tick)
  }

  private sync(force = false): void {
    const doc = this.doc
    if (!doc || !doc.timed) return

    const time = this.engine.getPosition()
    const primary = findActiveLineIndex(doc, time)
    const activeLines = new Set(findActiveLineIndexes(doc, time))

    for (let index = 0; index < doc.lines.length; index += 1) {
      const line = doc.lines[index]
      const flags: LineFlags = {
        current: index === primary,
        active: activeLines.has(index),
        past: index < primary,
        upcoming: index > primary,
        ended: index === primary && time >= line.end
      }
      this.applyLineFlags(index, flags)
    }

    for (const lineIndex of this.previousActiveLines) {
      if (!activeLines.has(lineIndex)) this.clearSegments(lineIndex)
    }

    for (const lineIndex of activeLines) {
      const line = doc.lines[lineIndex]
      if (line) this.syncSegments(line, time)
    }
    this.previousActiveLines = activeLines

    if (force) {
      this.lastPrimary = primary
      this.pendingScrollIndex = null
      this.scrollToLine(primary, false)
      return
    }

    if (primary !== this.lastPrimary) {
      this.lastPrimary = primary
      if (primary >= 0) this.pendingScrollIndex = primary
    }

    this.applyPendingScroll()
  }

  private applyLineFlags(index: number, next: LineFlags): void {
    const element = this.lineElements[index]
    if (!element) return

    const previous = this.lineFlags[index]
    if (previous === null) {
      element.classList.toggle('lyric-line--current', next.current)
      element.classList.toggle('lyric-line--active', next.active)
      element.classList.toggle('lyric-line--past', next.past)
      element.classList.toggle('lyric-line--upcoming', next.upcoming)
      element.classList.toggle('lyric-line--ended', next.ended)
      this.lineFlags[index] = next
      return
    }

    if (previous.current !== next.current) {
      element.classList.toggle('lyric-line--current', next.current)
    }
    if (previous.active !== next.active) {
      element.classList.toggle('lyric-line--active', next.active)
    }
    if (previous.past !== next.past) {
      element.classList.toggle('lyric-line--past', next.past)
    }
    if (previous.upcoming !== next.upcoming) {
      element.classList.toggle('lyric-line--upcoming', next.upcoming)
    }
    if (previous.ended !== next.ended) {
      element.classList.toggle('lyric-line--ended', next.ended)
    }

    this.lineFlags[index] = next
  }

  private syncSegments(line: LyricLine, time: number): void {
    const elements = this.segmentElements.get(line.index)
    const flags = this.segmentFlags.get(line.index)
    if (!elements || !flags || !line.segments) return

    const activeIndex = findActiveSegmentIndex(line, time)
    const previousActiveElement = this.activeSegmentElements.get(line.index) ?? null

    for (let index = 0; index < elements.length; index += 1) {
      const segment = line.segments[index]
      if (!segment) continue

      const next: SegmentFlags = {
        sung: time >= segment.end,
        active: index === activeIndex && time >= segment.start && time < segment.end,
        upcoming: time < segment.start
      }
      const previous = flags[index]

      if (!previous || previous.sung !== next.sung) {
        elements[index].classList.toggle('lyric-seg--sung', next.sung)
      }
      if (!previous || previous.active !== next.active) {
        elements[index].classList.toggle('lyric-seg--active', next.active)
      }
      if (!previous || previous.upcoming !== next.upcoming) {
        elements[index].classList.toggle('lyric-seg--upcoming', next.upcoming)
      }

      flags[index] = next
    }

    const activeSegment = activeIndex >= 0 ? line.segments[activeIndex] : undefined
    const hasActiveSegment =
      activeSegment !== undefined && time >= activeSegment.start && time < activeSegment.end

    if (!hasActiveSegment || !activeSegment) {
      if (previousActiveElement) {
        previousActiveElement.style.removeProperty('--progress')
        this.activeSegmentElements.set(line.index, null)
        this.activeSegmentProgress.delete(line.index)
      }
      return
    }

    const activeElement = elements[activeIndex]
    if (!activeElement) return

    if (previousActiveElement && previousActiveElement !== activeElement) {
      previousActiveElement.style.removeProperty('--progress')
    }

    this.activeSegmentElements.set(line.index, activeElement)
    const progress = segmentProgress(activeSegment, time)
    if (this.activeSegmentProgress.get(line.index) !== progress) {
      activeElement.style.setProperty('--progress', progress.toFixed(3))
      this.activeSegmentProgress.set(line.index, progress)
    }
  }

  private clearSegments(lineIndex: number): void {
    const elements = this.segmentElements.get(lineIndex)
    if (!elements) return

    for (const element of elements) {
      element.classList.remove(...SEGMENT_CLASSES)
      element.style.removeProperty('--progress')
    }

    this.segmentFlags.set(
      lineIndex,
      elements.map(() => null)
    )
    this.activeSegmentElements.set(lineIndex, null)
    this.activeSegmentProgress.delete(lineIndex)
  }

  private applyPendingScroll(): void {
    if (this.pendingScrollIndex === null) return
    if (performance.now() < this.pausedUntil) return

    const index = this.pendingScrollIndex
    this.pendingScrollIndex = null
    this.scrollToLine(index, true)
  }

  private scrollToLine(index: number, smooth: boolean): void {
    if (index < 0) return

    const element = this.lineElements[index]
    if (!element) return

    const target = element.offsetTop + element.offsetHeight / 2 - this.scroller.clientHeight / 2
    this.scroller.scrollTo({ top: Math.max(0, target), behavior: smooth ? 'smooth' : 'auto' })
  }

  private readonly handleManualScroll = (): void => {
    this.pausedUntil = performance.now() + MANUAL_SCROLL_PAUSE_MS
    if (this.lastPrimary >= 0) this.pendingScrollIndex = this.lastPrimary
  }

  private readonly handleLineClick = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof Element)) return

    const lineElement = target.closest<HTMLElement>('.lyric-line')
    if (!lineElement || !this.linesElement.contains(lineElement)) return

    this.seekLine(lineElement)
  }

  private readonly handleLineKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return

    const target = event.target
    if (!(target instanceof Element)) return

    const lineElement = target.closest<HTMLElement>('.lyric-line')
    if (!lineElement || !this.linesElement.contains(lineElement)) return

    event.preventDefault()
    this.seekLine(lineElement)
  }

  private seekLine(lineElement: HTMLElement): void {
    const doc = this.doc
    if (!doc || !doc.timed) return

    const index = Number(lineElement.dataset.index)
    const line = doc.lines.find((item) => item.index === index)
    if (!line) return

    this.engine.seek(line.start)
  }
}
