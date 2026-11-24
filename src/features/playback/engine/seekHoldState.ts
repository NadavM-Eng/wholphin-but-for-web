// The sequencing of "a seek is in flight" for the subtitle layer: hidden at the skip, shown again once the latest seek has landed and a frame was drawn.

export type SeekHoldPhase = 'idle' | 'armed' | 'seeking' | 'landed'

export interface SeekHoldState {
  phase: SeekHoldPhase
  /** changes with every press and every new seek, so a frame callback scheduled for an older one is ignored */
  gen: number
}

export type SeekHoldEvent =
  /** a skip key or button was pressed: hide now, the seek itself may follow later (the seek bar commits after a pause) */
  | { type: 'press' }
  /** the video element started a seek (its "seeking" event) */
  | { type: 'seeking' }
  /** the video element finished a seek (its "seeked" event); `stillSeeking` is video.seeking at that moment */
  | { type: 'seeked'; stillSeeking: boolean }
  /** the frame that was waited for after landing was drawn */
  | { type: 'frame'; gen: number }
  /** nothing came for too long (a seek that never reaches the element): let go */
  | { type: 'timeout' }

export const SEEK_HOLD_IDLE: SeekHoldState = { phase: 'idle', gen: 0 }

/** The next state; the same object when nothing changes. */
export function seekHoldNext(s: SeekHoldState, e: SeekHoldEvent): SeekHoldState {
  switch (e.type) {
    case 'press':
      return { phase: 'armed', gen: s.gen + 1 }
    case 'seeking':
      return { phase: 'seeking', gen: s.gen + 1 }
    case 'seeked':
      // an earlier seek landing while a press still waits for its own seek does not count
      return s.phase === 'seeking' && !e.stillSeeking ? { phase: 'landed', gen: s.gen } : s
    case 'frame':
      return s.phase === 'landed' && e.gen === s.gen ? { phase: 'idle', gen: s.gen } : s
    case 'timeout':
      return s.phase === 'idle' ? s : { phase: 'idle', gen: s.gen }
  }
}

export const isSeekHeld = (s: SeekHoldState) => s.phase !== 'idle'
