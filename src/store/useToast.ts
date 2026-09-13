import { create } from 'zustand'
import { uid } from '../lib/uid'

export interface Toast {
  id: string
  text: string
  tone: 'info' | 'success' | 'error'
}

interface ToastState {
  toasts: Toast[]
  show: (text: string, tone?: Toast['tone']) => void
  dismiss: (id: string) => void
}

export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  show(text, tone = 'info') {
    const id = uid()
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }))
    setTimeout(() => get().dismiss(id), tone === 'error' ? 5000 : 2800)
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

export const toast = {
  info: (text: string) => useToast.getState().show(text, 'info'),
  success: (text: string) => useToast.getState().show(text, 'success'),
  error: (text: string) => useToast.getState().show(text, 'error'),
}
