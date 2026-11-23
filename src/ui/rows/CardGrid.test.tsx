import { cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CardGrid } from './CardGrid'

// jsdom has no ResizeObserver and lays nothing out; these tests are about the scroller marks only.
const g = globalThis as unknown as { ResizeObserver?: unknown }
const hadObserver = 'ResizeObserver' in g
const previousObserver = g.ResizeObserver
beforeAll(() => {
  g.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})
afterAll(() => {
  if (hadObserver) g.ResizeObserver = previousObserver
  else delete g.ResizeObserver
})
beforeEach(() => {
  // the page-scrolled grid restores its offset; jsdom only prints "not implemented"
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Scrolled({ marked }: { marked: boolean }) {
  const scroller = useRef<HTMLDivElement>(null)
  return (
    <div ref={scroller} data-testid="scroller" {...(marked ? { 'data-grid-scroller': '' } : {})}>
      <CardGrid count={3} columns={{ kind: 'fixed', columns: 3 }} getScrollElement={() => scroller.current} renderItem={(i) => <span>{i}</span>} />
    </div>
  )
}

// The scrollbar gutter of whatever scrolls a grid is always reserved (src/theme/global.css keys on these marks):
// the cards are sized from the scroller's width, which must not depend on whether the grid overflows.
describe('CardGrid scroller marks', () => {
  it('a grid scrolled by the page marks itself, also when it is empty', () => {
    const { container, rerender } = render(<CardGrid count={3} columns={{ kind: 'fixed', columns: 3 }} renderItem={(i) => <span>{i}</span>} />)
    expect(container.querySelector('[data-grid-window]')).not.toBeNull()
    rerender(<CardGrid count={0} columns={{ kind: 'fixed', columns: 3 }} renderItem={(i) => <span>{i}</span>} />)
    expect(container.querySelector('[data-grid-window]')).not.toBeNull()
  })

  it('a grid in its own scroller does not mark the page', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(<Scrolled marked />)
    expect(container.querySelector('[data-grid-window]')).toBeNull()
    expect(error).not.toHaveBeenCalled()
  })

  it('reports a scroller without the data-grid-scroller mark (development builds)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<Scrolled marked={false} />)
    expect(error).toHaveBeenCalledTimes(1)
    expect(String(error.mock.calls[0][0])).toContain('data-grid-scroller')
  })
})
