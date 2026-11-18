/**
 * A ResizeObserver whose work runs in the next animation frame (only the latest notification), never inside the
 * observer callback: a state update there re-lays the observed element within the same frame, which Safari
 * reports as "ResizeObserver loop completed with undelivered notifications". `onResize` reads the sizes it needs
 * itself and must keep the old state when nothing changed (`setX((prev) => (same ? prev : next))`; a primitive
 * state does that by itself). Returns the cleanup.
 */
export function observeResize(targets: Element | readonly Element[], onResize: () => void): () => void {
  let raf = 0
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(onResize)
  })
  for (const t of targets instanceof Element ? [targets] : targets) ro.observe(t)
  return () => {
    cancelAnimationFrame(raf)
    ro.disconnect()
  }
}
