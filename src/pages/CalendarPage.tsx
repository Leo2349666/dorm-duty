import { useMemo, useState } from 'react'
import AdjustDialog from '../components/AdjustDialog'
import Avatar from '../components/Avatar'
import Sheet from '../components/Sheet'
import { copyText } from '../lib/clipboard'
import { withAlpha } from '../lib/constants'
import {
  addDays,
  cycleIndexOf,
  daysBetween,
  endOfMonth,
  formatMD,
  formatMDWeek,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  todayStr,
  weekdayCN,
} from '../lib/date'
import { schedulePlainText } from '../lib/exporters'
import { activeMembers, liveItems } from '../lib/schedule'
import { toast } from '../store/useToast'
import { useAppStore, useMyMember } from '../store/useAppStore'

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日']

/** 记住用户上次选的是月视图还是周视图 */
const VIEW_KEY = 'dorm-duty:calendar-view'

function readSavedView(): 'month' | 'week' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'week' ? 'week' : 'month'
  } catch {
    return 'month'
  }
}

/**
 * 排班日历。
 *
 * 月视图保持**紧凑的点阵样式**：日期 + 周期标号 + 一排在底色上的小圆点，
 * 一格看一天，一屏看一个月。小圆点的颜色对应值日项（配合上方图例）。
 *
 * 在这个基础上补了四种状态的区分，靠底色和日期颜色表达：
 *   · 今天          → 白底 + 蓝色描边 + 日期蓝底白字
 *   · 本月已过去    → 浅灰底 + 日期浅灰
 *   · 本月还没到    → 白底 + 日期深色
 *   · 相邻月份      → 更深的灰底 + 整体变淡
 */
export default function CalendarPage() {
  const data = useAppStore((s) => s.data)
  const myMember = useMyMember()
  const [view, setView] = useState<'month' | 'week'>(readSavedView)
  const [cursor, setCursor] = useState(() => todayStr())
  const [selected, setSelected] = useState<string | null>(null)
  const [adjustDate, setAdjustDate] = useState<string | null>(null)

  const items = useMemo(() => (data ? liveItems(data.dutyItems) : []), [data])
  const members = useMemo(() => (data ? activeMembers(data.members) : []), [data])
  const dayMap = useMemo(() => {
    const map = new Map<
      string,
      { cycleIndex: number; slots: { memberId: string; dutyItemId: string; isManual: boolean }[] }
    >()
    data?.days.forEach((d) => map.set(d.date, d))
    return map
  }, [data])

  if (!data) return null

  const { startDate, endDate, periodDays } = data.room
  const today = todayStr()
  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? '已删除成员'

  const cycleOf = (date: string) => cycleIndexOf(date, startDate, periodDays)
  const cycleLabel = (date: string) => {
    const idx = cycleOf(date)
    if (idx < 0) return '未开始'
    return periodDays === 7 ? `第 ${idx + 1} 周` : `第 ${idx + 1} 轮`
  }
  const inSchedule = (date: string) => date >= startDate && date <= endDate
  const cycleStart = (date: string) => addDays(startDate, cycleOf(date) * periodDays)

  // ---------------- 月视图 ----------------
  const gridStart = startOfWeek(startOfMonth(cursor))
  const gridEnd = endOfMonth(cursor)
  const gridWeeks = Math.max(4, Math.ceil((daysBetween(gridStart, gridEnd) + 1) / 7))
  const gridDays = Array.from({ length: gridWeeks * 7 }, (_, i) => addDays(gridStart, i))

  // ---------------- 周视图 ----------------
  const weekStart = startOfWeek(cursor)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const isCurrent =
    view === 'month' ? isSameMonth(cursor, today) : weekStart === startOfWeek(today)

  const selectedPlan = selected ? dayMap.get(selected) : undefined

  function changeView(next: 'month' | 'week') {
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      /* 存不下也无所谓 */
    }
  }

  async function copySelected() {
    if (!selected || !selectedPlan) return
    const text = schedulePlainText(data!.room, data!.members, data!.dutyItems, {
      date: selected,
      cycleIndex: selectedPlan.cycleIndex,
      slots: selectedPlan.slots.map((s) => ({ ...s, note: null })),
    })
    const ok = await copyText(text)
    if (ok) toast.success('已复制')
    else toast.error('复制失败')
  }

  function shift(delta: number) {
    setCursor(addDays(cursor, view === 'month' ? delta * 30 : delta * 7))
  }

  return (
    <div className="flex flex-col gap-4 md:h-full md:min-h-0">
      {/* ---------------- 顶部：标题 + 月/周切换 ---------------- */}
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">排班日历</h1>
        <div className="flex rounded-xl border border-slate-200/70 bg-white p-0.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          {(['month', 'week'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => changeView(v)}
              className={[
                'rounded-[10px] px-3.5 py-1.5 text-[13px] transition',
                view === v
                  ? 'bg-gradient-to-b from-blue-500 to-blue-600 font-medium text-white shadow-[0_4px_10px_-6px_rgba(37,99,235,0.9)]'
                  : 'text-slate-500',
              ].join(' ')}
            >
              {v === 'month' ? '月' : '周'}
            </button>
          ))}
        </div>
      </header>

      {/* ---------------- 月份导航 ---------------- */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="上一页"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/70 bg-white text-slate-500 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition active:scale-95"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="flex-1 text-center">
          <div className="text-[15px] font-semibold tracking-tight text-slate-800">
            {view === 'month'
              ? `${cursor.slice(0, 4)} 年 ${Number(cursor.slice(5, 7))} 月`
              : `${formatMD(weekStart)} – ${formatMD(addDays(weekStart, 6))}`}
          </div>
          {!isCurrent ? (
            <button
              type="button"
              onClick={() => setCursor(today)}
              className="mt-0.5 text-[11px] font-medium text-blue-600"
            >
              回到今天
            </button>
          ) : (
            <div className="mt-0.5 text-[11px] text-slate-400">
              {view === 'month' ? '本月' : '本周'}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="下一页"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/70 bg-white text-slate-500 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition active:scale-95"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* ---------------- 值日项配色图例 ---------------- */}
      {items.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {items.map((item) => (
            <span key={item.id} className="inline-flex items-center gap-1.5 text-[12px] leading-none text-slate-600">
              {/* 中文字形的视觉重心比行盒中心略低，圆点往下挪 1px 才是真正的视觉居中 */}
              <span
                className="relative top-[1px] h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.name}
            </span>
          ))}
        </div>
      ) : null}

      {/* ================= 月视图 ================= */}
      {view === 'month' ? (
        <section className="rounded-2xl border border-slate-200/70 bg-white p-2 shadow-soft md:flex md:min-h-0 md:flex-1 md:flex-col">
          <div className="grid grid-cols-7 gap-1 pb-1">
            {WEEK_LABELS.map((w) => (
              <div key={w} className="py-1 text-center text-[12px] font-medium text-slate-600">
                {w}
              </div>
            ))}
          </div>

          {/* 桌面端让网格按可用高度等分每一行：窗口多高都能正好铺满，不会溢出到要滚动 */}
          <div
            className="grid grid-cols-7 gap-1 md:min-h-0 md:flex-1"
            style={{ gridTemplateRows: `repeat(${gridWeeks}, minmax(70px, 1fr))` }}
          >
            {gridDays.map((date) => {
              const plan = dayMap.get(date)
              const inMonth = isSameMonth(date, cursor)
              const inRange = inSchedule(date)
              const past = date < today
              const isTodayCell = isToday(date)
              const isCycleStart = inRange && date === cycleStart(date)
              const manual = plan?.slots.some((s) => s.isManual)

              // 四种状态只输出「一个」样式串。
              // 不要把互斥的类同时塞进 className —— 那样谁生效取决于 Tailwind
              // 生成 CSS 的先后顺序，实测 bg-white 会盖掉 bg-blue-50。
              const stateClass = isTodayCell
                ? 'border-blue-400 bg-blue-100 shadow-[0_1px_2px_rgba(16,24,40,0.03)] ring-2 ring-blue-500'
                : !inMonth
                  ? 'border-transparent bg-white'
                  : !inRange
                    ? 'border-dashed border-slate-200 bg-slate-50/60'
                    : past
                      ? 'border-slate-300/70 bg-slate-200'
                      : 'border-slate-200/60 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]'

              // 相邻月份不靠底色、靠「整体淡出」来表达，才不会和"已过"的灰底撞车
              const fadeClass = !inMonth ? 'opacity-35' : ''

              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => setSelected(date)}
                  className={[
                    // 左右内边距收到 4px，5 个圆点才能在一行里排下（原来会换行占两行）
                    // 桌面端格子会随窗口变高，用 justify-center 把内容当成一整块居中，
                    // 否则日期贴顶、圆点贴底，中间会空出一大片
                    'flex min-h-[76px] flex-col rounded-xl border px-1 py-1.5 text-left transition active:scale-[0.97] md:h-full md:min-h-0 md:justify-center',
                    stateClass,
                  ].join(' ')}
                >
                  <div
                    className={[
                      // 桌面端格子宽，"改"字推在最右边会和日期离得很远，所以靠到日期旁边
                      'flex items-baseline justify-between md:justify-start md:gap-2',
                      fadeClass,
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'flex h-[22px] min-w-[22px] items-center justify-center rounded-full text-[13px] font-medium',
                        isTodayCell
                          ? 'bg-blue-600 px-1 text-white'
                          : !inMonth
                            ? 'text-slate-400'
                            : past
                              ? 'text-slate-500'
                              : 'text-slate-700',
                      ].join(' ')}
                    >
                      {Number(date.slice(8, 10))}
                    </span>
                    {manual ? (
                      <span className="shrink-0 pl-0.5 text-[10px] font-semibold leading-[20px] text-amber-500">
                        改
                      </span>
                    ) : null}
                  </div>

                  {/* 这一行必须在每个格子里都占位。
                      只在周期首日渲染的话，这些格子会被撑高，
                      底部的圆点就会比相邻日期矮一截，横向看过去参差不齐。 */}
                  <span
                    className={[
                      'mt-0.5 truncate text-[9px] leading-[12px]',
                      isCycleStart ? (isTodayCell ? 'text-blue-500' : 'text-slate-500') : 'invisible',
                    ].join(' ')}
                  >
                    {isCycleStart ? cycleLabel(date) : '\u00A0'}
                  </span>

                  <div
                    className={[
                      'mt-auto flex flex-wrap gap-[2px] pt-1.5 md:mt-2 md:gap-[3px]',
                      fadeClass,
                    ].join(' ')}
                  >
                    {plan
                      ? items
                          .filter((item) => plan.slots.some((s) => s.dutyItemId === item.id))
                          .map((item) => (
                            <span
                              key={item.id}
                              className="h-[5px] w-[5px] rounded-full md:h-[7px] md:w-[7px]"
                              style={{ backgroundColor: item.color }}
                            />
                          ))
                      : null}
                  </div>
                </button>
              )
            })}
          </div>

          <p className="mt-2 space-y-1 border-t border-slate-100 pt-2.5 text-[12px] leading-snug text-slate-600">
            <span className="block">小圆点代表当天有哪些值日项</span>
            <span className="block">
              蓝底=今天 · 灰底=已过 · 白底=未到 · 淡出=相邻月份 ·
              <span className="font-medium text-amber-500">改</span>
              =手动调整过
            </span>
          </p>
        </section>
      ) : (
        /* ================= 周视图 ================= */
        <section className="space-y-2">
          {weekDays.map((date) => {
            const plan = dayMap.get(date)
            const inRange = inSchedule(date)
            const isTodayCell = isToday(date)
            const past = date < today

            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelected(date)}
                className={[
                  'w-full rounded-2xl border px-4 py-3 text-left transition active:scale-[0.99]',
                  isTodayCell
                    ? 'border-blue-300 bg-white ring-2 ring-blue-500/40'
                    : past
                      ? 'border-slate-200/60 bg-slate-50'
                      : 'border-slate-200/60 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]',
                ].join(' ')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={[
                        'text-sm font-medium',
                        isTodayCell ? 'text-blue-700' : past ? 'text-slate-500' : 'text-slate-800',
                      ].join(' ')}
                    >
                      {weekdayCN(date)}
                    </span>
                    <span className="text-xs text-slate-400">{formatMD(date)}</span>
                    {isTodayCell ? (
                      <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white">
                        今天
                      </span>
                    ) : null}
                  </div>
                  {inRange ? (
                    <span className="text-[11px] text-slate-400">{cycleLabel(date)}</span>
                  ) : (
                    <span className="text-[11px] text-slate-300">不在排班范围</span>
                  )}
                </div>

                <div className="mt-2 space-y-1.5">
                  {plan
                    ? items.map((item) => {
                        const owners = plan.slots
                          .filter((s) => s.dutyItemId === item.id)
                          .map((s) => s.memberId)
                        if (owners.length === 0) return null
                        return (
                          <div key={item.id} className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="w-14 shrink-0 text-xs text-slate-500">{item.name}</span>
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-700">
                              {owners.map((id) => {
                                const isMe = myMember?.id === id
                                return (
                                  <span
                                    key={id}
                                    className={isMe ? 'font-medium' : undefined}
                                    style={isMe ? { color: item.color } : undefined}
                                  >
                                    {memberName(id)}
                                  </span>
                                )
                              })}
                            </span>
                          </div>
                        )
                      })
                    : null}
                </div>
              </button>
            )
          })}
        </section>
      )}

      {/* ---------------- 单日详情 ---------------- */}
      <Sheet open={selected !== null} title={selected ? formatMDWeek(selected) : ''} onClose={() => setSelected(null)}>
        {selectedPlan ? (
          <>
            <div className="mb-4 flex items-center gap-2">
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-600">
                {cycleLabel(selected!)}
              </span>
              <span className="text-[11px] text-slate-400">周期内每天安排相同</span>
              {selectedPlan.slots.some((s) => s.isManual) ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-600">
                  手动调整过
                </span>
              ) : null}
            </div>

            <div className="space-y-3">
              {items.map((item) => {
                const owners = selectedPlan.slots
                  .filter((s) => s.dutyItemId === item.id)
                  .map((s) => s.memberId)
                if (owners.length === 0) return null
                return (
                  <div key={item.id} className="flex items-center gap-3">
                    <span className="h-6 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="w-16 shrink-0 text-[13px] font-medium text-slate-600">{item.name}</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {owners.map((id) => {
                        const isMe = myMember?.id === id
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5"
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
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={() => {
                  setAdjustDate(selected!)
                  setSelected(null)
                }}
              >
                调整这一天
              </button>
              <button type="button" className="btn-ghost flex-1" onClick={copySelected}>
                复制文本
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              {selected && !inSchedule(selected)
                ? `这一天不在排班范围内（${formatMD(startDate)} ~ ${formatMD(endDate)}）。`
                : '这一天还没有排班数据。回到首页点「一键自动排班」即可生成。'}
            </p>
            {selected && inSchedule(selected) ? (
              <button
                type="button"
                className="btn-primary w-full"
                onClick={() => {
                  setAdjustDate(selected)
                  setSelected(null)
                }}
              >
                手动安排这一天
              </button>
            ) : null}
          </div>
        )}
      </Sheet>

      {adjustDate ? <AdjustDialog open date={adjustDate} onClose={() => setAdjustDate(null)} /> : null}
    </div>
  )
}
