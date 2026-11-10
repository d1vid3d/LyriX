/** One-shot notifier used for quiet, per-library history failure toasts. */
export class OnceNotifier {
  private notified = false

  /** Returns true only for the first call until reset. */
  tryNotify(): boolean {
    if (this.notified) return false
    this.notified = true
    return true
  }

  reset(): void {
    this.notified = false
  }

  hasNotified(): boolean {
    return this.notified
  }
}
