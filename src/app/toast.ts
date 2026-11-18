import { create } from 'zustand'

export interface ToastMessage {
  id: number
  message: string
  durationMs: number
}

interface ToastState {
  toasts: ToastMessage[]
}

export const useToastStore = create<ToastState>()(() => ({ toasts: [] }))

/** Android Toast.LENGTH_SHORT / LENGTH_LONG. */
export const TOAST_SHORT_MS = 2000
export const TOAST_LONG_MS = 3500

let nextId = 1

/** Shows a transient message at the bottom of the screen (upstream `showToast`). Returns its id. */
export function toast(message: string, opts: { long?: boolean; durationMs?: number } = {}): number {
  const id = nextId++
  const durationMs = opts.durationMs ?? (opts.long ? TOAST_LONG_MS : TOAST_SHORT_MS)
  useToastStore.setState((s) => ({ toasts: [...s.toasts, { id, message, durationMs }] }))
  setTimeout(() => dismissToast(id), durationMs)
  return id
}

export function dismissToast(id: number) {
  useToastStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}
