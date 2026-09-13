import Modal from './Modal'
import { useConfirmState } from '../store/useConfirm'

/** 全局确认对话框的宿主，挂在 App 根部即可 */
export default function ConfirmHost() {
  const options = useConfirmState((s) => s.options)
  const close = useConfirmState((s) => s.close)
  if (!options) return null

  const danger = options.tone === 'danger'

  return (
    <Modal
      open
      title={options.title}
      onClose={() => close(false)}
      footer={
        <div className="flex gap-3">
          <button type="button" className="btn-ghost flex-1" onClick={() => close(false)}>
            {options.cancelText ?? '取消'}
          </button>
          <button
            type="button"
            className={danger ? 'btn flex-1 bg-rose-600 text-white hover:bg-rose-700' : 'btn-primary flex-1'}
            onClick={() => close(true)}
          >
            {options.confirmText ?? '确定'}
          </button>
        </div>
      }
    >
      <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
        {options.message ?? '确定要执行这个操作吗？'}
      </p>
    </Modal>
  )
}
