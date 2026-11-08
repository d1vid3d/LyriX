import type { MenuPosition } from './contextMenu'

/**
 * Attaches right-click and keyboard menu opening to a target. The native context menu is kept for
 * text inputs because they never pass through this helper.
 */
export function attachMenuTrigger(
  element: HTMLElement,
  open: (position: MenuPosition) => void
): void {
  element.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    element.focus({ preventScroll: true })
    open({ x: event.clientX, y: event.clientY })
  })

  element.addEventListener('keydown', (event) => {
    if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
      event.preventDefault()
      open({ anchor: element })
    }
  })
}
