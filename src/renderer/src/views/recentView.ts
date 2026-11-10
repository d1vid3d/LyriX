import type { HistoryRecordingState } from '../../../shared/types'
import type { HistoryEmptyModel, HistoryStatusModel } from '../../history/historyStatusModel'
import type { AppElements } from '../dom'

export interface RecentViewDeps {
  elements: AppElements
  onWhy(): void
  onPlay(): void
  onShuffle(): void
  onToggleRecording(): void
  onStartRecording(): void
  onClear(): void
}

/** Header/status/empty-state renderer for the Recently played view. */
export class RecentView {
  private readonly deps: RecentViewDeps

  constructor(deps: RecentViewDeps) {
    this.deps = deps
    deps.elements.recentWhyButton.addEventListener('click', () => deps.onWhy())
    deps.elements.recentPlayButton.addEventListener('click', () => deps.onPlay())
    deps.elements.recentShuffleButton.addEventListener('click', () => deps.onShuffle())
    deps.elements.recentRecordButton.addEventListener('click', () => deps.onToggleRecording())
    deps.elements.recentStartButton.addEventListener('click', () => deps.onStartRecording())
    deps.elements.recentClearButton.addEventListener('click', () => deps.onClear())
  }

  render(
    status: HistoryStatusModel,
    empty: HistoryEmptyModel | null,
    recording: HistoryRecordingState,
    hasItems: boolean
  ): void {
    const { elements } = this.deps
    elements.recentStatus.textContent = status.text
    elements.recentStatus.className = `recent-status recent-status--${status.tone}`
    elements.recentWhyButton.hidden = !status.showWhy
    elements.recentPlayButton.disabled = !hasItems
    elements.recentShuffleButton.disabled = !hasItems
    elements.recentClearButton.disabled = recording.status === 'not-created'
    elements.recentRecordButton.setAttribute('aria-pressed', String(recording.enabled))
    elements.recentRecordButton.textContent = recording.enabled
      ? 'Recording history'
      : 'Record history'
    elements.recentStartButton.hidden = empty === null || !empty.startAction
  }

  destroy(): void {
    // Buttons live for the page lifetime; the composition root owns cleanup.
  }
}
