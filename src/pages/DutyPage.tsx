import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AdjustDialog from '../components/AdjustDialog'
import Avatar from '../components/Avatar'
import ExportActions from '../components/ExportActions'
import Icon from '../components/Icon'
import { copyText } from '../lib/clipboard'
import { withAlpha } from '../lib/constants'
import { cycleIndexOf, cycleRange, formatMD, formatMDWeek, todayStr } from '../lib/date'
import { schedulePlainText } from '../lib/exporters'
import { activeMembers, liveItems, sharedItemIds } from '../lib/schedule'
import { toast } from '../store/useToast'
import { useAppStore, useMyMember } from '../store/useAppStore'

/**
 * 首页 = 当前周期。
 *
 * 因为规则规定"周期内每天安排完全相同"，显示一整轮和显示今天其实是同一件事，
 * 所以首页永远只有一屏内容：上面说清"这是哪一轮"，下面列"谁负责什么"。
 *
 * 特别注意：如果今天不在排班范围内（学期还没开始或者已经结束），
 * 这里**只显示"无排班"的提示**，不会拿最近一轮的排班来充数，
 * 避免把过期的安排误当成今天的安排。
 */
export default function DutyPage() {
  const data = useAppStore((s) => s.data)
  const generateAll = useAppStore((s) => s.generateAll)
  const busy = useAppStore((s) => s.busy)
  const myMember = useMyMember()
  const [adjustOpen, setAdjustOpen] = useState(false)

  const members = useMemo(() => (data ? activeMembers(data.members) : []), [data])
  const items = useMemo(() => (data ? liveItems(data.dutyItems) : []), [data])

  if (!data) return null

  const { startDate, endDate, periodDays } = data.room
  const today = todayStr()
  const inRange = today >= startDate && today <= endDate

  async function handleGenerate() {
    try {
      await generateAll()
      toast.success('排班已生成')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成失败')
    }
  }

  // ---------------------------------------------------------------------
  // 情况一：今天不在排班范围内 —— 只显示"无排班"
  // ---------------------------------------------------------------------
  if (!inRange) {
    const notStarted = today < startDate
    return (
      <div className="space-y-4">
        <section className="card flex flex-col items-center px-6 py-10 text-center">
          <span className="empty-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
              <rect x="3" y="4" width="18" height="17" rx="2.5" />
              <path d="M8 2v4M16 2v4M3 10h18" strokeLinecap="round" />
            </svg>
          </span>
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">当前无排班</h1>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
            {notStarted
              ? '排班还没开始。当前排班范围从今天之后才开始。'
              : '排班已经结束。当前日期超出了这一学期的排班范围。'}
          </p>
          <p className="mt-3 rounded-full bg-slate-100 px-3.5 py-1.5 text-xs text-slate-500">
            排班范围：{formatMD(startDate)} – {formatMD(endDate)}
          </p>
          <div className="mt-6 flex w-full max-w-xs flex-col gap-2.5">
            <Link to={`/room/${data.room.id}/settings`} className="btn-primary w-full">
              去设置排班周期
            </Link>
            <Link to={`/room/${data.room.id}/calendar`} className="btn-ghost w-full">
              查看日历
            </Link>
          </div>
        </section>
      </div>
    )
  }

  // ---------------------------------------------------------------------
  // 情况二：在当前范围内，按当前日期定位到本轮
  // ---------------------------------------------------------------------
  const cycleIndex = cycleIndexOf(today, startDate, periodDays)
  const range = cycleRange(startDate, periodDays, cycleIndex)
  const plan = data.days.find((d) => d.cycleIndex === cycleIndex)
  const slots = plan?.slots ?? []
  const hasPlans = data.days.length > 0
  const dayIndexInCycle = Math.floor(
    (new Date(today).getTime() - new Date(range.start).getTime()) / 86400000,
  ) + 1
  const remainingDays = periodDays - dayIndexInCycle + 1

  // 标题文案按周期长度自适应，日期范围永远显示
  let title = '本轮值日'
  let subtitle = `第 ${cycleIndex + 1} 轮（${periodDays} 天）· ${formatMD(range.start)} – ${formatMD(range.end)}`
  if (periodDays === 1) {
    title = '今日值日'
    subtitle = formatMDWeek(range.start)
  } else if (periodDays === 7) {
    title = '本周值日'
    subtitle = `第 ${cycleIndex + 1} 周 · ${formatMD(range.start)} – ${formatMD(range.end)}`
  }

  const shared = sharedItemIds(slots)
  const memberOf = (id: string) => members.find((m) => m.id === id)
  const memberName = (id: string) => memberOf(id)?.name ?? '已删除成员'

  async function handleShare() {
    if (!plan || !data) return
    const text = schedulePlainText(data.room, data.members, data.dutyItems, plan)
    const ok = await copyText(text)
    if (ok) toast.success('已复制，可直接粘贴到寝室群')
    else toast.error('复制失败，请长按页面手动选择')
  }

  return (
    <div className="space-y-5">
      {/* ---------------- 本轮概览 ---------------- */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 p-5 text-white shadow-lift">
        {/* 用径向渐变做高光，而不是模糊圆形 —— 渐变的边缘本身就是透明过渡，
            被卡片裁切时不会留下生硬的切边 */}
        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(130%_100%_at_100%_0%,rgba(255,255,255,0.22),transparent_58%)]" />
        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(100%_90%_at_0%_100%,rgba(34,211,238,0.3),transparent_60%)]" />

        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="mt-1.5 text-[13px] text-blue-100/90">{subtitle}</p>
            </div>
            {myMember ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 py-1 pl-1 pr-2.5 text-xs backdrop-blur-sm">
                <Avatar name={myMember.name} size={20} color="#ffffff" solid />
                {myMember.name}
              </span>
            ) : null}
          </div>

          {periodDays > 1 ? (
            <div className="mt-5">
              <div className="flex items-baseline justify-between text-[11px] text-blue-100/80">
                <span>今天是本轮第 {dayIndexInCycle} 天</span>
                <span>还剩 {remainingDays} 天轮换</span>
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-white/80 transition-all"
                  style={{ width: `${(dayIndexInCycle / periodDays) * 100}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* ---------------- 还没生成过排班 ---------------- */}
      {!hasPlans ? (
        <section className="card flex flex-col items-center px-6 py-10 text-center">
          <span className="empty-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
              <path d="M12 3v18M3 12h18" strokeLinecap="round" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </span>
          <h2 className="mt-4 text-base font-semibold tracking-tight text-slate-900">还没有生成排班</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
            确认成员和值日内容之后，点下面的按钮生成 {formatMD(startDate)} 至 {formatMD(endDate)} 的全部排班
          </p>
          <button type="button" className="btn-primary mt-5 w-full max-w-xs" onClick={handleGenerate} disabled={busy}>
            {busy ? '生成中…' : '一键自动排班'}
          </button>
        </section>
      ) : !plan ? (
        /* ---------------- 有排班，但本轮恰好没有 ---------------- */
        <section className="card flex flex-col items-center px-6 py-10 text-center">
          <span className="empty-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4l3 2" strokeLinecap="round" />
            </svg>
          </span>
          <h2 className="mt-4 text-base font-semibold tracking-tight text-slate-900">本轮无排班</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
            这一轮还没有生成安排。可以在设置里重新生成整学期的排班。
          </p>
          <button type="button" className="btn-primary mt-5 w-full max-w-xs" onClick={handleGenerate} disabled={busy}>
            {busy ? '生成中…' : '立即生成'}
          </button>
        </section>
      ) : (
        <>
          {/* ---------------- 本轮分工 ---------------- */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="card-title">本轮分工</h2>
              <span className="text-[11px] text-slate-400">周期内每天相同</span>
            </div>

            {items.map((item) => {
              const owners = slots.filter((s) => s.dutyItemId === item.id).map((s) => s.memberId)
              const mine = myMember ? owners.includes(myMember.id) : false
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl border px-3.5 py-3.5 shadow-soft transition"
                  style={{
                    borderColor: mine ? withAlpha(item.color, 0.55) : 'rgba(226, 232, 240, 0.75)',
                    backgroundColor: mine ? withAlpha(item.color, 0.08) : '#ffffff',
                  }}
                >
                  <span
                    className="h-6 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="w-14 shrink-0 text-[13px] font-semibold text-slate-700">{item.name}</span>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
                    {owners.length === 0 ? (
                      <span className="text-xs text-slate-400">未安排</span>
                    ) : (
                      owners.map((id) => {
                        const isMe = myMember?.id === id
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5"
                            style={
                              isMe
                                ? { backgroundColor: item.color, color: '#fff' }
                                : { backgroundColor: withAlpha(item.color, 0.12), color: '#334155' }
                            }
                          >
                            <Avatar name={memberName(id)} size={20} color={item.color} solid={isMe} />
                            <span className="text-[13px] font-medium">{memberName(id)}</span>
                          </span>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </section>

          {shared.length > 0 ? (
            <p className="rounded-2xl border border-amber-200/70 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-700">
              当前有成员共同负责同一项值日内容。长期看轮换是公平的，如果想让一人一项更清爽，
              可以到「内容」页新增值日项。
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="btn-primary" onClick={() => setAdjustOpen(true)}>
              <Icon path="M7 4v16M17 4v16M4 8h6M14 16h6" size={16} />
              快速换班
            </button>
            <button type="button" className="btn-ghost" onClick={handleShare}>
              <Icon path="M9 9h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2ZM5 15V5a2 2 0 0 1 2-2h10" size={16} />
              复制文本
            </button>
          </div>

          <section className="card">
            <h2 className="card-title mb-3">导出</h2>
            <ExportActions />
          </section>
        </>
      )}

      {adjustOpen && plan ? <AdjustDialog open date={plan.date} onClose={() => setAdjustOpen(false)} /> : null}
    </div>
  )
}
