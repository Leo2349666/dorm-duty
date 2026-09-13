import { useMemo } from 'react'
import { useAppStore } from '../store/useAppStore'

/**
 * 统计。
 *
 * 「公平度」算法说明：
 *   取每个人在本学期的值日次数，算平均值和标准差，
 *   公平度 = (1 - 标准差 / 平均值) × 100%。
 *   含义是「每个人的值日量有多接近」。100% 表示人人一样多。
 *   标准差越小越公平，所以这个分数越高越好。
 */
export default function StatsPage() {
  const data = useAppStore((s) => s.data)

  const stats = useMemo(() => {
    if (!data) return null
    const allSlots = data.days.flatMap((d) => d.slots)
    const nameOf = new Map(data.members.map((m) => [m.id, m.name]))

    const perMember = new Map<string, number>()
    for (const slot of allSlots) {
      perMember.set(slot.memberId, (perMember.get(slot.memberId) ?? 0) + 1)
    }
    const memberRows = Array.from(perMember.entries())
      .map(([id, count]) => ({ id, name: nameOf.get(id) ?? '已删除成员', count }))
      .sort((a, b) => b.count - a.count)

    const perItem = new Map<string, number>()
    for (const slot of allSlots) {
      perItem.set(slot.dutyItemId, (perItem.get(slot.dutyItemId) ?? 0) + 1)
    }
    const itemRows = data.dutyItems
      .map((item) => ({ id: item.id, name: item.name, color: item.color, count: perItem.get(item.id) ?? 0 }))
      .sort((a, b) => b.count - a.count)

    const counts = memberRows.map((r) => r.count)
    const total = counts.reduce((a, b) => a + b, 0)
    const mean = counts.length ? total / counts.length : 0
    const variance = counts.length
      ? counts.reduce((acc, c) => acc + (c - mean) ** 2, 0) / counts.length
      : 0
    const std = Math.sqrt(variance)
    const cv = mean > 0 ? std / mean : 0
    const fairness = Math.max(0, Math.round((1 - cv) * 100))
    const max = counts.length ? Math.max(...counts) : 0
    const min = counts.length ? Math.min(...counts) : 0

    return { memberRows, itemRows, total, mean, std, fairness, max, min }
  }, [data])

  if (!data || !stats) return null

  if (data.days.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">统计</h1>
        <div className="card text-center text-sm text-slate-400">
          还没有排班数据。生成排班之后这里会显示每个人的值日次数和公平度。
        </div>
      </div>
    )
  }

  const maxMember = Math.max(1, ...stats.memberRows.map((r) => r.count))
  const maxItem = Math.max(1, ...stats.itemRows.map((r) => r.count))

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">统计</h1>
        <p className="mt-1 text-sm text-slate-500">
          统计范围：{data.days[0].date} 起共 {data.days.length} 天已生成的排班
        </p>
      </header>

      <section className="card">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm text-slate-500">公平度</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{stats.fairness}%</p>
          </div>
          <div className="text-right text-xs leading-relaxed text-slate-400">
            最多 {stats.max} 次 / 最少 {stats.min} 次
            <br />
            平均 {stats.mean.toFixed(1)} 次 / 人
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={[
              'h-full rounded-full transition-all',
              stats.fairness >= 90 ? 'bg-emerald-500' : stats.fairness >= 70 ? 'bg-amber-400' : 'bg-rose-400',
            ].join(' ')}
            style={{ width: `${stats.fairness}%` }}
          />
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-slate-400">
          公平度 = (1 − 标准差 ÷ 平均值) × 100%，衡量每个人的值日量有多接近。100% 表示完全一样多。
        </p>
      </section>

      <section className="card">
        <h2 className="card-title mb-3">每人值日次数</h2>
        <div className="space-y-2.5">
          {stats.memberRows.map((row) => (
            <div key={row.id} className="flex items-center gap-3">
              <span className="w-16 shrink-0 truncate text-sm text-slate-600">{row.name}</span>
              <div className="h-6 flex-1 overflow-hidden rounded-lg bg-slate-100">
                <div
                  className="h-full rounded-lg bg-blue-500"
                  style={{ width: `${(row.count / maxMember) * 100}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-sm text-slate-500">{row.count} 次</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="card-title mb-3">每项值日内容被分配次数</h2>
        <div className="space-y-2.5">
          {stats.itemRows.map((row) => (
            <div key={row.id} className="flex items-center gap-3">
              <span className="w-16 shrink-0 truncate text-sm text-slate-600">{row.name}</span>
              <div className="h-6 flex-1 overflow-hidden rounded-lg bg-slate-100">
                <div
                  className="h-full rounded-lg"
                  style={{ width: `${(row.count / maxItem) * 100}%`, backgroundColor: row.color }}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-sm text-slate-500">{row.count} 次</span>
            </div>
          ))}
        </div>
      </section>

      <p className="rounded-2xl border border-slate-200/70 bg-white/70 px-3.5 py-3 text-[11px] leading-relaxed text-slate-500">
        说明：统计的是「人 × 天」的次数。因为同一个周期内每天安排相同，
        所以一个人在 7 天的周期里会固定负责同一项，统计上就是 7 次。
        {stats.memberRows.length > 0 && stats.max - stats.min > 0
          ? ` 当前最多与最少相差 ${stats.max - stats.min} 次，差距主要来自未走完的最后一个周期。`
          : ''}
      </p>
    </div>
  )
}
