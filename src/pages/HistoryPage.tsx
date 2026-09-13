import { useState } from 'react'
import { formatDateTime } from '../lib/date'
import { useAppStore } from '../store/useAppStore'
import type { ChangeLog } from '../types'

const ACTION_LABEL: Record<ChangeLog['action'], { text: string; className: string }> = {
  generate: { text: '自动排班', className: 'bg-blue-50 text-blue-600' },
  adjust: { text: '手动调整', className: 'bg-amber-50 text-amber-600' },
  reset: { text: '重置', className: 'bg-slate-100 text-slate-600' },
  settings: { text: '设置变更', className: 'bg-violet-50 text-violet-600' },
  member: { text: '成员变更', className: 'bg-emerald-50 text-emerald-600' },
  item: { text: '内容变更', className: 'bg-cyan-50 text-cyan-600' },
  import: { text: '导入数据', className: 'bg-slate-100 text-slate-600' },
}

function countSlots(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object' && Array.isArray((value as { slots?: unknown[] }).slots)) {
    return (value as { slots: unknown[] }).slots.length
  }
  return 0
}

/** 历史记录：按时间倒序展示每一次自动排班和手动调整 */
export default function HistoryPage() {
  const data = useAppStore((s) => s.data)
  const [expanded, setExpanded] = useState<string | null>(null)

  if (!data) return null

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">历史记录</h1>
        <p className="mt-1 text-sm text-slate-500">
          每一次自动排班、手动调整、成员和设置变更都会留下记录，按时间倒序排列。
        </p>
      </header>

      {data.logs.length === 0 ? (
        <div className="card text-center text-sm text-slate-400">还没有任何操作记录</div>
      ) : (
        <ul className="space-y-2.5">
          {data.logs.map((log) => {
            const meta = ACTION_LABEL[log.action] ?? { text: '操作', className: 'bg-slate-100 text-slate-600' }
            const open = expanded === log.id
            const beforeCount = countSlots(log.before)
            const afterCount = countSlots(log.after)
            const hasDiff = beforeCount > 0 || afterCount > 0

            return (
              <li key={log.id} className="card">
                <div className="flex items-start gap-3">
                  <span className={`tag shrink-0 ${meta.className}`}>{meta.text}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed text-slate-700">{log.summary}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{formatDateTime(log.createdAt)}</p>

                    {hasDiff ? (
                      <button
                        type="button"
                        className="mt-2 text-[11px] text-blue-600"
                        onClick={() => setExpanded(open ? null : log.id)}
                      >
                        {open ? '收起调整前后对比' : '查看调整前后对比'}
                      </button>
                    ) : null}

                    {open && hasDiff ? (
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                        <div className="rounded-xl bg-rose-50 p-2.5">
                          <p className="mb-1 font-medium text-rose-600">调整前（{beforeCount} 条）</p>
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-rose-700/80">
                            {JSON.stringify(log.before, null, 1)}
                          </pre>
                        </div>
                        <div className="rounded-xl bg-emerald-50 p-2.5">
                          <p className="mb-1 font-medium text-emerald-600">调整后（{afterCount} 条）</p>
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-emerald-700/80">
                            {JSON.stringify(log.after, null, 1)}
                          </pre>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
