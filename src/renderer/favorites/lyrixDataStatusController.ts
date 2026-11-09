import type { LyrixDataStatus } from '../../shared/types'

export interface LyrixDataStatusApi {
  getLyrixDataStatus(): Promise<LyrixDataStatus>
  retryLyrixData(): Promise<LyrixDataStatus>
  onLyrixDataStatus(listener: (status: LyrixDataStatus) => void): () => void
}

export interface LyrixDataStatusControllerDeps {
  api: LyrixDataStatusApi
  onStatusChange?(status: LyrixDataStatus): void
}

const UNBOUND: LyrixDataStatus = {
  state: 'unbound',
  writable: false,
  libraryId: null,
  message: null
}

/** Mirrors the main-process LyrixData status and exposes retry. */
export class LyrixDataStatusController {
  private readonly deps: LyrixDataStatusControllerDeps
  private status: LyrixDataStatus = UNBOUND
  private readonly listeners = new Set<(status: LyrixDataStatus) => void>()

  constructor(deps: LyrixDataStatusControllerDeps) {
    this.deps = deps
  }

  getStatus(): LyrixDataStatus {
    return this.status
  }

  subscribe(listener: (status: LyrixDataStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async reload(): Promise<LyrixDataStatus> {
    try {
      this.apply(await this.deps.api.getLyrixDataStatus())
    } catch (error) {
      console.error('[renderer] Could not read the LyrixData status', error)
    }
    return this.status
  }

  async retry(): Promise<LyrixDataStatus> {
    try {
      this.apply(await this.deps.api.retryLyrixData())
    } catch (error) {
      console.error('[renderer] Could not retry LyrixData', error)
    }
    return this.status
  }

  /** Subscribes to status events; returns the unsubscribe function. */
  start(): () => void {
    return this.deps.api.onLyrixDataStatus((status) => this.apply(status))
  }

  private apply(status: LyrixDataStatus): void {
    this.status = status
    this.deps.onStatusChange?.(status)
    for (const listener of [...this.listeners]) listener(status)
  }
}
