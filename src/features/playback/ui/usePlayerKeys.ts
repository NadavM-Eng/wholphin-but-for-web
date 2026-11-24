// Keyboard handling of the player: PlaybackKeyHandler.onKeyEvent (spec 05 §9.8) mapped to the keyboard, plus the
// web shortcuts of §B7. Listeners run in the capture phase so they act before the global arrow-key navigator
// (src/app/spatialNav), which skips events whose default was prevented.
import { useEffect, type RefObject } from 'react'
import { getPlaybackEngine } from '../engine'
import { HoldSeek } from './holdSeek'
import { shortcutFor, type Shortcut } from './keymap'

export interface PlayerKeyContext {
  controlsVisible: boolean
  dialogOpen: boolean
  /** the error screen is up: its buttons get the keys, Back leaves */
  errorShown: boolean
  dpadSeekVisible: boolean
  oneClickPause: boolean
  skipBackMs: number
  skipForwardMs: number
  durationMs: number
  /** controls hidden, Left/Right: seek per dpadSeekMode (immediate + indicator, or the trickplay overlay) */
  dpadSeek: (deltaMs: number) => void
  showControls: () => void
  /** ArrowUp / ArrowDown with the focus outside the strip, panels and dialogs: change the volume by one step */
  adjustVolume: (dir: -1 | 1) => void
  pulseControls: () => void
  clearDpadSeek: () => void
  back: () => void
  /** leave the player now */
  leave: () => void
  /** close the open dialog (Escape / Back pressed while focus is outside it) */
  closeDialog: () => void
  shortcut: (s: Shortcut) => void
}

const BACK_KEYS = new Set(['Escape', 'Backspace', 'BrowserBack', 'GoBack'])
const ENTER_KEYS = new Set(['Enter', 'NumpadEnter', 'Select'])

function isTyping(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  if (t.isContentEditable || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true
  return t instanceof HTMLInputElement && !['button', 'checkbox', 'radio', 'range'].includes(t.type)
}

/**
 * Focus is on the Next Up card, the floating Skip button or the autoplay-blocked prompt: upstream's key handler
 * is not in their key path, so Enter activates them.
 */
function inSidePanel(t: EventTarget | null): boolean {
  return t instanceof Element && !!t.closest('[data-next-up],[data-skip-segment],[data-player-prompt]')
}

/** Focus is inside the control strip or a sheet: there the arrows move between the controls. */
function inControls(t: EventTarget | null): boolean {
  return t instanceof Element && !!t.closest('[data-focus-trap],[data-player-sheet]')
}

function dirOf(key: string): -1 | 1 | 0 {
  return key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0
}

export function usePlayerKeys(ctx: RefObject<PlayerKeyContext>) {
  useEffect(() => {
    const engine = getPlaybackEngine()
    const hold = new HoldSeek()
    /** a key whose down went to the error screen: its up must not act on the player that Retry brings back */
    let swallowUp: string | null = null
    /**
     * the Enter whose key down reached the hidden-controls branch. Only that Enter acts on key up: an Enter that
     * picked a chapter, a queue item or a sheet item (which then hid the controls / closed the sheet) was consumed
     * by that button, as on the TV where the click fires on key up (ChapterRowOverlay.kt:117-121 hides the controls)
     */
    let armedEnter: string | null = null

    const onDown = (e: KeyboardEvent) => {
      const c = ctx.current
      if (ENTER_KEYS.has(e.key) && !e.repeat) armedEnter = null
      if (e.defaultPrevented || isTyping(e.target)) return
      if (c.dialogOpen) {
        // the dialog handles keys inside itself; this catches Back when focus was left outside it. A dialog opened
        // from a sheet's row (a colour choice of the subtitle style sheet) is drawn outside the sheet and handles
        // its own keys too.
        if (BACK_KEYS.has(e.key) && !(e.target instanceof Element && e.target.closest('[data-player-sheet], [data-focus-trap]'))) {
          e.preventDefault()
          c.closeDialog()
        }
        return
      }
      if (c.errorShown) {
        // Enter/Space activate the focused error action; arrows move between them (spatialNav)
        swallowUp = e.key
        if (BACK_KEYS.has(e.key) && !e.repeat) {
          e.preventDefault()
          c.leave()
        }
        return
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (BACK_KEYS.has(e.key)) {
        e.preventDefault()
        if (!e.repeat) c.back()
        return
      }
      if (c.controlsVisible) c.pulseControls()
      // Enter on the floating Skip button / Next Up card: the button acts on key down and unmounts, so its key up
      // lands on the body; upstream's click only seeks (PlaybackPage.kt:606-628), the controls stay hidden
      if (!c.controlsVisible && ENTER_KEYS.has(e.key) && inSidePanel(e.target)) swallowUp = e.key
      const hidden = !c.controlsVisible && !inSidePanel(e.target)
      const dir = dirOf(e.key)
      if (hidden && dir) {
        // hold-to-seek: a tap seeks on key up, a hold seeks with acceleration after 8 repeats
        e.preventDefault()
        const m = hold.keyDown(dir, e.repeat, performance.now(), c.durationMs)
        if (m != null) c.dpadSeek(dir * (dir < 0 ? c.skipBackMs : c.skipForwardMs) * m)
        return
      }
      if (!inSidePanel(e.target) && !inControls(e.target) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        // Web behaviour that differs from the TV app (there Up shows the controls): Up/Down change the volume
        e.preventDefault()
        c.adjustVolume(e.key === 'ArrowUp' ? 1 : -1)
        return
      }
      if (hidden && e.key === 'Tab') {
        // keyboard users reach the hidden controls with Tab (Enter does so only when it is not "one click pause")
        e.preventDefault()
        if (!e.repeat) c.showControls()
        return
      }
      if (hidden && ENTER_KEYS.has(e.key)) {
        // acted on at key up, like upstream; keep the hidden overlay's buttons from activating
        e.preventDefault()
        if (ENTER_KEYS.has(e.key)) armedEnter = e.key
        return
      }
      const s = shortcutFor(e)
      if (!s) return
      e.preventDefault()
      const repeatable = s === 'seek-back' || s === 'seek-forward' || typeof s === 'object'
      if (e.repeat && !repeatable) return
      c.shortcut(s)
    }

    const onUp = (e: KeyboardEvent) => {
      // every key up counts as an interaction (pass-out protection)
      engine.reportInteraction()
      const c = ctx.current
      if (swallowUp === e.key) {
        swallowUp = null
        return
      }
      if (isTyping(e.target) || c.dialogOpen || c.errorShown) return
      // Space toggles on key down; stop its key-up click on a focused button
      if (e.key === ' ') e.preventDefault()
      if (c.controlsVisible || inSidePanel(e.target)) return
      const dir = dirOf(e.key)
      if (dir) {
        e.preventDefault()
        const m = hold.keyUp(dir)
        if (m != null) c.dpadSeek(dir * (dir < 0 ? c.skipBackMs : c.skipForwardMs) * m)
        return
      }
      if (ENTER_KEYS.has(e.key)) {
        e.preventDefault()
        if (armedEnter !== e.key) return
        armedEnter = null
        if (c.dpadSeekVisible) c.clearDpadSeek()
        else if (c.oneClickPause) engine.togglePlay()
        else c.showControls()
      }
    }

    window.addEventListener('keydown', onDown, true)
    window.addEventListener('keyup', onUp, true)
    return () => {
      window.removeEventListener('keydown', onDown, true)
      window.removeEventListener('keyup', onUp, true)
    }
  }, [ctx])
}
