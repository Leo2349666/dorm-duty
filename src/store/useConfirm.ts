import { create } from 'zustand'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  /** danger 会把手感做得更有"后果感"，用于删除这类操作 */
  tone?: 'default' | 'danger'
}

interface ConfirmState {
  options: ConfirmOptions | null
  resolver: ((ok: boolean) => void) | null
  open: (options: ConfirmOptions) => Promise<boolean>
  close: (ok: boolean) => void
}

const store = create<ConfirmState>((set, get) => ({
  options: null,
  resolver: null,
  open(options) {
    return new Promise<boolean>((resolve) => {
      set({ options, resolver: resolve })
    })
  },
  close(ok) {
    const { resolver } = get()
    set({ options: null, resolver: null })
    resolver?.(ok)
  },
}))

/** 用法：if (await confirm({ title: '删除房间？' })) { ... } */
export const confirm = (options: ConfirmOptions): Promise<boolean> => store.getState().open(options)

export const useConfirmState = store
