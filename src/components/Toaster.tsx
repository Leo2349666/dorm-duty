import { useToast } from '../store/useToast'

/** 轻提示。固定在顶部中间，移动端也不会挡住底部导航。 */
export default function Toaster() {
  const toasts = useToast((s) => s.toasts)
  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[
            'animate-fade max-w-[92vw] rounded-xl px-4 py-2.5 text-sm shadow-lg',
            t.tone === 'error'
              ? 'bg-rose-600 text-white'
              : t.tone === 'success'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-900/90 text-white',
          ].join(' ')}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}
