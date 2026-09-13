import { useEffect, useMemo, useState } from 'react'
import Avatar from './Avatar'
import Modal from './Modal'
import { withAlpha } from '../lib/constants'
import { buildCycleSlots, liveItems, activeMembers } from '../lib/schedule'
import { cycleIndexOf } from '../lib/date'
import { useAppStore } from '../store/useAppStore'
import { toast } from '../store/useToast'
import type { AdjustScope, Slot } from '../types'

interface AdjustDialogProps {
  open: boolean
  date: string
  onClose: () => void
}

const SCOPE_OPTIONS: { value: AdjustScope; label: string; hint: string }[] = [
  { value: 'day', label: '仅今天', hint: '只改这一天，其它日子照旧。适合"某人今天临时有事"' },
  { value: 'cycle', label: '仅本周期', hint: '本轮的所有天一起改，下轮起恢复原样' },
  { value: 'future', label: '从此以后', hint: '改写轮换基线，本轮及之后每一轮都按新顺序轮换' },
]

export default function AdjustDialog({ open, date, onClose }: AdjustDialogProps) {
  const data = useAppStore((s) => s.data)
  const adjust = useAppStore((s) => s.adjust)
  const busy = useAppStore((s) => s.busy)

  const items = useMemo(() => (data ? liveItems(data.dutyItems) : []), [data])
  const members = useMemo(() => (data ? activeMembers(data.members) : []), [data])

  /** itemId -> 选中的成员 id 列表（顺序即共担顺序） */
  const [selection, setSelection] = useState<Record<string, string[]>>({})
  const [scope, setScope] = useState<AdjustScope>('day')

  useEffect(() => {
    if (!open || !data) return
    const existing = data.days.find((d) => d.date === date)
    const slots =
      existing?.slots ??
      buildCycleSlots(
        activeMembers(data.members),
        liveItems(data.dutyItems),
        cycleIndexOf(date, data.room.startDate, data.room.periodDays),
      )
    const next: Record<string, string[]> = {}
    for (const item of items) {
      next[item.id] = slots.filter((s) => s.dutyItemId === item.id).map((s) => s.memberId)
    }
    setSelection(next)
    setScope('day')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, date, data?.room.id])

  function toggle(itemId: string, memberId: string) {
    setSelection((prev) => {
      const current = prev[itemId] ?? []
      const next = current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId]
      return { ...prev, [itemId]: next }
    })
  }

  const assigned = useMemo(() => {
    const set = new Set<string>()
    Object.values(selection).forEach((ids) => ids.forEach((id) => set.add(id)))
    return set
  }, [selection])

  const idleMembers = members.filter((m) => !assigned.has(m.id))

  async function handleSave() {
    const slots: Slot[] = []
    for (const item of items) {
      for (const memberId of selection[item.id] ?? []) {
        slots.push({ memberId, dutyItemId: item.id, isManual: true, note: null })
      }
    }
    if (slots.length === 0) {
      toast.error('至少要给一项值日内容安排人')
      return
    }
    try {
      await adjust(date, slots, scope)
      if (idleMembers.length) {
        toast.info(`已保存。注意：${idleMembers.map((m) => m.name).join('、')} 本轮没有值日项`)
      } else {
        toast.success('已保存')
      }
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    }
  }

  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? '未知'

  return (
    <Modal
      open={open}
      title={`调整 ${date} 的值日安排`}
      onClose={onClose}
      maxHeight="58vh"
      footer={
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {SCOPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setScope(option.value)}
                className={[
                  'rounded-xl px-2 py-2.5 text-sm transition active:scale-[0.97]',
                  scope === option.value
                    ? 'bg-gradient-to-b from-blue-500 to-blue-600 font-medium text-white shadow-[0_6px_14px_-8px_rgba(37,99,235,0.9)]'
                    : 'border border-slate-200 bg-white text-slate-600',
                ].join(' ')}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-slate-500">
            {SCOPE_OPTIONS.find((o) => o.value === scope)?.hint}
          </p>
          <button type="button" className="btn-primary w-full" onClick={handleSave} disabled={busy}>
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      }
    >
      <p className="mb-4 text-xs leading-relaxed text-slate-500">
        点成员名字即可切换由谁负责，可以多选（多人共担）。同一人被选到多项也没问题。
      </p>

      <div className="space-y-4">
        {items.map((item) => {
          const chosen = selection[item.id] ?? []
          return (
            <div key={item.id}>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-lg"
                  style={{ backgroundColor: withAlpha(item.color, 0.14) }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                </span>
                <span className="text-[13px] font-semibold text-slate-800">{item.name}</span>
                {chosen.length > 1 ? (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px]"
                    style={{ backgroundColor: withAlpha(item.color, 0.14), color: item.color }}
                  >
                    共担
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => {
                  const on = chosen.includes(m.id)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggle(item.id, m.id)}
                      className={[
                        'inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-[13px] font-medium transition active:scale-95',
                        on ? 'text-white' : 'border border-slate-200 bg-white text-slate-600',
                      ].join(' ')}
                      style={on ? { backgroundColor: item.color } : undefined}
                    >
                      <Avatar name={m.name} size={22} color={item.color} solid={on} />
                      {m.name}
                    </button>
                  )
                })}
              </div>
              {chosen.length === 0 ? (
                <p className="mt-1.5 text-xs text-rose-500">这项还没安排人</p>
              ) : null}
            </div>
          )
        })}
      </div>

      {idleMembers.length > 0 ? (
        <div className="mt-5 rounded-xl border border-amber-200/70 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-700">
          本轮以下成员没有任何值日项：{idleMembers.map((m) => memberName(m.id)).join('、')}
          <br />
          规则是"每人每周期至少一项"。临时换班可以忽略这条，长期这样建议调整成员顺序或值日内容。
        </div>
      ) : null}
    </Modal>
  )
}
