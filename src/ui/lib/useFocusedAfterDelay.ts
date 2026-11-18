import { useEffect, useState, type RefObject } from 'react'

/**
 * Web form of upstream `rememberFocusedAfterDelay` (`ui/cards/SeasonCard.kt:236`): true once the element
 * has been "TV focused" (hovered by a fine pointer, or keyboard focus-visible) for `delayMs`.
 * Listens on `ref` and its descendants.
 */
export function useFocusedAfterDelay(ref: RefObject<HTMLElement | null>, delayMs = 500): boolean {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let hovered = false
    // The gallery renders static "focused" samples inside [data-demo-focus].
    let focused = !!el.closest('[data-demo-focus]')
    let timer: ReturnType<typeof setTimeout> | undefined
    if (focused) timer = setTimeout(() => setActive(true), delayMs)

    const update = () => {
      clearTimeout(timer)
      if (hovered || focused) {
        timer = setTimeout(() => setActive(true), delayMs)
      } else {
        setActive(false)
      }
    }
    const onEnter = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
        hovered = true
        update()
      }
    }
    const onLeave = () => {
      hovered = false
      update()
    }
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null
      focused = !!t?.matches?.(':focus-visible')
      update()
    }
    const onFocusOut = (e: FocusEvent) => {
      if (!el.contains(e.relatedTarget as Node | null)) {
        focused = false
        update()
      }
    }
    el.addEventListener('pointerenter', onEnter)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('focusin', onFocusIn)
    el.addEventListener('focusout', onFocusOut)
    return () => {
      clearTimeout(timer)
      el.removeEventListener('pointerenter', onEnter)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('focusin', onFocusIn)
      el.removeEventListener('focusout', onFocusOut)
    }
  }, [ref, delayMs])

  return active
}
