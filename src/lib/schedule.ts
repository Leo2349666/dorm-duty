import type { DutyItem, DayPlan, Member, Slot } from '../types'
import { addDays, cycleIndexOf, cycleRange, daysBetween, enumerateDates } from './date'

/**
 * ============================================================================
 * 排班算法
 * ============================================================================
 *
 * 规则（来自需求）：
 *   1. 只按「周期」轮换，周期内每天安排完全相同。
 *   2. 成员和值日内容各有一份固定顺序列表。
 *   3. 第 0 个周期：成员顺序与值日内容顺序一一对应。
 *   4. 之后每个周期，成员顺序「循环右移一位」再对应。
 *      例：3 人 [甲,乙,丙] → 下一轮变 [丙,甲,乙]。
 *   5. 人数 < 项数：多出来的项按成员顺序继续循环分配（允许一人多岗）。
 *   6. 人数 > 项数：多出来的人与前面的项共同负责（允许多人共担）。
 *   7. 最后一个周期不足周期天数时按实际天数生成，人员沿用该轮结果。
 *
 * 核心洞察：把两个列表按 max(人数, 项数) 的长度同时循环展开，
 * 就能用**同一个公式**统一覆盖 5、6、7 三种情况：
 *
 *     第 i 个槽位：成员 = rotated[i % n]，值日项 = items[i % m]
 *     （i 从 0 到 max(n, m) - 1）
 *
 * 验证「每人每周期至少一项」：i 遍历到 max(n,m)-1 时，
 * 无论 n <= m 还是 n > m，0..n-1 每个下标都会出现至少一次。
 */

/** 数组循环右移 k 位。[甲,乙,丙] 右移 1 位 → [丙,甲,乙] */
export function rotateRight<T>(list: T[], k: number): T[] {
  const n = list.length
  if (n === 0) return []
  const shift = ((k % n) + n) % n
  if (shift === 0) return [...list]
  return list.map((_, i) => list[(i - shift + n) % n])
}

/** 数组循环左移 k 位，是 rotateRight 的逆运算 */
export function rotateLeft<T>(list: T[], k: number): T[] {
  return rotateRight(list, -k)
}

/** 参与排班的成员：未被停用、未被删除，按 orderIndex 升序 */
export function activeMembers(members: Member[]): Member[] {
  return members
    .filter((m) => m.active && !m.deletedAt)
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex || a.createdAt.localeCompare(b.createdAt))
}

/** 生效中的值日内容，按 orderIndex 升序 */
export function liveItems(items: DutyItem[]): DutyItem[] {
  return items
    .filter((i) => !i.deletedAt)
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex || a.createdAt.localeCompare(b.createdAt))
}

/**
 * 计算第 cycleIndex 个周期的「值日项 → 成员」配对。
 * 这是整个系统唯一的排班真相来源，自动排班、重排、共担提示都用它。
 */
export function buildCycleSlots(
  members: Member[],
  items: DutyItem[],
  cycleIndex: number,
): Slot[] {
  const n = members.length
  const m = items.length
  if (n === 0 || m === 0) return []

  const rotated = rotateRight(members, cycleIndex)
  const total = Math.max(n, m)
  const slots: Slot[] = []

  for (let i = 0; i < total; i += 1) {
    slots.push({
      memberId: rotated[i % n].id,
      dutyItemId: items[i % m].id,
      isManual: false,
      note: null,
    })
  }
  return slots
}

/**
 * 生成 [from, to] 区间内的每一天排班。
 * 如果区间跨过排班结束日期，会自动截断。
 */
export function buildPlans(
  members: Member[],
  items: DutyItem[],
  startDate: string,
  periodDays: number,
  from: string,
  to: string,
): DayPlan[] {
  if (daysBetween(from, to) < 0) return []

  const plans: DayPlan[] = []
  for (const date of enumerateDates(from, to)) {
    const cycleIndex = cycleIndexOf(date, startDate, periodDays)
    plans.push({ date, cycleIndex, slots: buildCycleSlots(members, items, cycleIndex) })
  }
  return plans
}

/**
 * 从「第 fromCycleIndex 个周期」开始（含）重新生成到结束日期。
 * 用于：新增/停用成员、改动值日项、调整轮换基线之后的局部重排。
 */
export function rebuildFromCycle(
  members: Member[],
  items: DutyItem[],
  room: { startDate: string; endDate: string; periodDays: number },
  fromCycleIndex: number,
): DayPlan[] {
  const { start } = cycleRange(room.startDate, room.periodDays, fromCycleIndex)
  const from = start < room.startDate ? room.startDate : start
  if (from > room.endDate) return []
  return buildPlans(members, items, room.startDate, room.periodDays, from, room.endDate)
}

/** 把某一天的 slots 复制给整个周期 */
export function slotsOfCycleDate(
  startDate: string,
  periodDays: number,
  date: string,
  slots: Slot[],
  endDate: string,
): DayPlan[] {
  const cycleIndex = cycleIndexOf(date, startDate, periodDays)
  const range = cycleRange(startDate, periodDays, cycleIndex)
  const from = range.start < startDate ? startDate : range.start
  const to = range.end > endDate ? endDate : range.end
  return enumerateDates(from, to).map((d) => ({ date: d, cycleIndex, slots }))
}

/**
 * 「从此以后更新轮换基线」的核心。
 *
 * 用户在第 k 个周期里把配对改成了 editSlots，我们要反推出一个**新的成员顺序基线**，
 * 使得「新基线跑出来的第 k 个周期」刚好等于用户的编辑结果，
 * 并且之后所有周期都基于新基线继续轮换。
 *
 * 做法：编辑结果告诉我们「第 k 轮轮换后的成员序列 R」，
 * 那么新基线 = R 反向旋转 k 位（rotateLeft(R, k)）。
 *
 * 举例：基线 [甲,乙,丙]，k=1 时轮换结果是 [丙,甲,乙]。
 * 用户把它改回 [甲,乙,丙]，则新基线 = rotateLeft([甲,乙,丙], 1) = [乙,丙,甲]，
 * 于是第 1 轮 = rotateRight([乙,丙,甲], 1) = [甲,乙,丙]，与用户编辑一致 ✓
 *
 * 返回排好序的成员 id 数组（长度 = 成员数），调用方据此写回 orderIndex。
 */
export function deriveBaseline(
  members: Member[],
  items: DutyItem[],
  cycleIndex: number,
  editSlots: Slot[],
): string[] {
  const n = members.length
  const m = items.length
  if (n === 0) return []
  if (m === 0) return members.map((x) => x.id)

  const fallback = rotateRight(members, cycleIndex).map((x) => x.id)
  const valid = new Set(members.map((x) => x.id))
  const used = new Set<string>()
  const seq: string[] = []

  for (let s = 0; s < n; s += 1) {
    const item = items[s % m]
    // 该项被分配到的全部成员，保持编辑结果里的顺序
    const candidates = editSlots.filter((slot) => slot.dutyItemId === item.id).map((slot) => slot.memberId)
    const picked = candidates.length > 0 ? candidates[s % candidates.length] : undefined
    if (picked && valid.has(picked) && !used.has(picked)) {
      seq.push(picked)
      used.add(picked)
    } else {
      // 用户可能把同一项分给了多个人，也可能取消了一项的安排，这里先留空
      seq.push('')
    }
  }

  // 补齐没推导出来的位置，保证不丢人、不重复
  for (let s = 0; s < n; s += 1) {
    if (seq[s]) continue
    const fill = fallback.find((id) => !used.has(id))
    if (fill) {
      seq[s] = fill
      used.add(fill)
    }
  }
  for (let s = 0; s < n; s += 1) {
    if (!seq[s]) seq[s] = members[s].id
  }

  // seq 是「第 cycleIndex 轮轮换之后」的成员序列，
  // 反推基线要把它转回第 0 轮的位置。
  return rotateLeft(seq, cycleIndex)
}

/** 把成员数组按给定的 id 顺序重新编号 orderIndex */
export function reorderBy(members: Member[], orderedIds: string[]): Member[] {
  const map = new Map(members.map((m) => [m.id, m]))
  const result: Member[] = []
  orderedIds.forEach((id, index) => {
    const m = map.get(id)
    if (m) {
      result.push({ ...m, orderIndex: index, deletedAt: m.deletedAt ?? null })
      map.delete(id)
    }
  })
  // 剩下没被列出的成员接在末尾（正常情况下 orderedIds 会包含全部成员）
  let tail = orderedIds.length
  for (const m of members) {
    if (map.has(m.id)) {
      result.push({ ...m, orderIndex: tail })
      tail += 1
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// 下面三个是给界面用的辅助函数
// ---------------------------------------------------------------------------

/** 每天的安排里，某个成员负责了哪几项 */
export function itemsOfMember(slots: Slot[], memberId: string): string[] {
  return slots.filter((s) => s.memberId === memberId).map((s) => s.dutyItemId)
}

/** 某个值日项由哪几个成员负责 */
export function membersOfItem(slots: Slot[], dutyItemId: string): string[] {
  return slots.filter((s) => s.dutyItemId === dutyItemId).map((s) => s.memberId)
}

/**
 * 检测「同一值日项被多人共担」的情况，用于首页那句温和提醒。
 * 返回被共担的值日项 id 列表。
 */
export function sharedItemIds(slots: Slot[]): string[] {
  const seen = new Map<string, number>()
  for (const slot of slots) {
    seen.set(slot.dutyItemId, (seen.get(slot.dutyItemId) ?? 0) + 1)
  }
  const out: string[] = []
  seen.forEach((count, id) => {
    if (count > 1) out.push(id)
  })
  return out
}

/** 校验：是否每个启用成员都至少分到一项 */
export function membersWithoutDuty(slots: Slot[], members: Member[]): string[] {
  const assigned = new Set(slots.map((s) => s.memberId))
  return members.filter((m) => !assigned.has(m.id)).map((m) => m.id)
}

/** 最后一个周期的编号（周期不足时也按实际算） */
export function lastCycleIndex(startDate: string, endDate: string, periodDays: number): number {
  return cycleIndexOf(endDate, startDate, periodDays)
}

/** 下一轮的起始日期（用于「新成员下周期生效」的提示文案） */
export function nextCycleStart(startDate: string, periodDays: number, cycleIndex: number): string {
  return addDays(startDate, (cycleIndex + 1) * periodDays)
}
