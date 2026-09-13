import dayjs from 'dayjs'

export const DATE_FMT = 'YYYY-MM-DD'

/** 今天的日期字符串 */
export function todayStr(): string {
  return dayjs().format(DATE_FMT)
}

/** 把任意可解析的日期规整成 YYYY-MM-DD */
export function normalizeDate(input: string | Date): string {
  return dayjs(input).format(DATE_FMT)
}

/** 日期加 n 天 */
export function addDays(date: string, n: number): string {
  return dayjs(date).add(n, 'day').format(DATE_FMT)
}

/** b - a 的天数差（按自然日计算，忽略时分秒） */
export function daysBetween(a: string, b: string): number {
  return dayjs(b).startOf('day').diff(dayjs(a).startOf('day'), 'day')
}

/** 生成 [from, to] 之间的全部日期（含两端） */
export function enumerateDates(from: string, to: string): string[] {
  const out: string[] = []
  const total = daysBetween(from, to)
  for (let i = 0; i <= total; i += 1) out.push(addDays(from, i))
  return out
}

/**
 * 计算某个日期落在第几个周期（从 0 开始）。
 * 周期完全由「开始日期 + 周期天数」决定，与自然周无关。
 * 例如开始日期是周三、周期 7 天，那每个周期就是「周三 → 下周二」。
 */
export function cycleIndexOf(date: string, startDate: string, periodDays: number): number {
  const days = daysBetween(startDate, date)
  return Math.floor(days / periodDays)
}

/** 第 k 个周期的起止日期 */
export function cycleRange(
  startDate: string,
  periodDays: number,
  cycleIndex: number,
): { start: string; end: string } {
  const start = addDays(startDate, cycleIndex * periodDays)
  return { start, end: addDays(start, periodDays - 1) }
}

/** 3月5日 */
export function formatMD(date: string): string {
  return dayjs(date).format('M月D日')
}

/** 2026年3月5日 */
export function formatYMD(date: string): string {
  return dayjs(date).format('YYYY年M月D日')
}

/** 周一 */
export function weekdayCN(date: string): string {
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return names[dayjs(date).day()]
}

/** 3月5日 周四 */
export function formatMDWeek(date: string): string {
  return `${formatMD(date)} ${weekdayCN(date)}`
}

/** 2026-03-05 14:32 */
export function formatDateTime(iso: string): string {
  return dayjs(iso).format('YYYY-MM-DD HH:mm')
}

/**
 * 两个日期相差几个周期（用于判断「下一轮」）。
 */
export function cyclesBetween(a: string, b: string, periodDays: number): number {
  return Math.floor(daysBetween(a, b) / periodDays)
}

/** 该日期所在自然周的周一 */
export function startOfWeek(date: string): string {
  const d = dayjs(date)
  const dow = d.day() === 0 ? 7 : d.day() // 把周日算成第 7 天
  return d.subtract(dow - 1, 'day').format(DATE_FMT)
}

/** 该日期所在自然月的 1 号 */
export function startOfMonth(date: string): string {
  return dayjs(date).startOf('month').format(DATE_FMT)
}

/** 该日期所在自然月的最后一天 */
export function endOfMonth(date: string): string {
  return dayjs(date).endOf('month').format(DATE_FMT)
}

export function isSameMonth(a: string, b: string): boolean {
  return dayjs(a).isSame(dayjs(b), 'month')
}

export function isToday(date: string): boolean {
  return dayjs(date).isSame(dayjs(), 'day')
}
