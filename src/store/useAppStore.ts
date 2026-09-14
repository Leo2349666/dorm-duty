import { create } from 'zustand'
import { createAdapter, isCloudMode } from '../data'
import type { DataAdapter, SyncStatus } from '../data/types'
import { DEFAULT_DUTY_ITEMS, DEFAULT_MEMBER_NAMES, DEFAULT_PERIOD_DAYS, pickColor } from '../lib/constants'
import { addDays, cycleIndexOf, cycleRange, todayStr } from '../lib/date'
import {
  activeMembers,
  buildPlans,
  deriveBaseline,
  liveItems,
  rebuildFromCycle,
  reorderBy,
  slotsOfCycleDate,
} from '../lib/schedule'
import {
  readIdentities,
  readLocalRooms,
  removeLocalRoom as removeLocalRoomRef,
  roomKey,
  upsertLocalRoom,
  writeIdentity,
} from '../lib/storage'
import { uid } from '../lib/uid'
import type {
  AdjustScope,
  ChangeLog,
  DayPlan,
  DutyItem,
  LocalRoomRef,
  Member,
  Room,
  RoomData,
  Slot,
} from '../types'

/** 默认排班跨度：约一个学期（18 周） */
const DEFAULT_SPAN_WEEKS = 18

/** 当前房间的实时订阅（切房间时要先退订，否则订阅会越积越多） */
let roomSubscription: (() => void) | null = null

function defaultEndDate(startDate: string): string {
  return addDays(startDate, DEFAULT_SPAN_WEEKS * 7 - 1)
}

/** 组装一句人类能看懂的变化描述，写进历史记录 */
function describeDiff(
  memberName: (id: string) => string,
  itemName: (id: string) => string,
  before: Slot[],
  after: Slot[],
): string {
  const key = (s: Slot) => `${s.dutyItemId}->${s.memberId}`
  const beforeSet = new Set(before.map(key))
  const afterSet = new Set(after.map(key))
  const parts: string[] = []
  for (const s of before) {
    if (!afterSet.has(key(s))) parts.push(`${itemName(s.dutyItemId)}：移除 ${memberName(s.memberId)}`)
  }
  for (const s of after) {
    if (!beforeSet.has(key(s))) parts.push(`${itemName(s.dutyItemId)}：加入 ${memberName(s.memberId)}`)
  }
  return parts.length ? parts.join('；') : '无实际变化'
}

export interface ImportPayload {
  room: Room
  members: Member[]
  dutyItems: DutyItem[]
  days: DayPlan[]
  logs?: ChangeLog[]
}

interface AppState {
  ready: boolean
  cloudMode: boolean
  adapter: DataAdapter | null
  syncStatus: SyncStatus
  busy: boolean
  rooms: LocalRoomRef[]
  data: RoomData | null
  identities: Record<string, string>

  init: () => Promise<void>
  refreshRooms: () => void
  addRoom: (
    apartment: string,
    building: string,
    roomNumber: string,
  ) => Promise<{ ok: true; roomId: string } | { ok: false; message: string }>
  enterRoom: (roomId: string) => Promise<void>
  leaveRoom: () => void
  removeLocalRoom: (key: string) => void
  reload: () => Promise<void>

  setIdentity: (memberId: string | null) => void

  addMember: (name: string) => Promise<void>
  updateMember: (id: string, patch: Partial<Member>) => Promise<void>
  removeMember: (id: string) => Promise<void>
  reorderMembers: (orderedIds: string[]) => Promise<void>

  addDutyItem: (name: string) => Promise<void>
  updateDutyItem: (id: string, patch: Partial<DutyItem>) => Promise<void>
  removeDutyItem: (id: string) => Promise<void>
  reorderDutyItems: (orderedIds: string[]) => Promise<void>

  updateRoomSettings: (patch: Partial<Room>) => Promise<void>

  generateAll: () => Promise<void>
  regenerateFromCycle: (cycleIndex: number) => Promise<void>
  adjust: (date: string, slots: Slot[], scope: AdjustScope) => Promise<void>
  importRoom: (payload: ImportPayload) => Promise<string | null>
}

export const useAppStore = create<AppState>((set, get) => {
  /** 写一条历史记录（同时更新界面和存储） */
  async function addLogEntry(
    action: ChangeLog['action'],
    summary: string,
    date: string | null,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    const { adapter, data } = get()
    if (!adapter || !data) return
    const entry: ChangeLog = {
      id: uid(),
      roomId: data.room.id,
      date,
      action,
      summary,
      before,
      after,
      createdAt: new Date().toISOString(),
    }
    set((state) => (state.data ? { data: { ...state.data, logs: [entry, ...state.data.logs] } } : {}))
    await adapter.addLog(entry)
  }

  /** 把若干天的排班合并进当前状态（同日期覆盖） */
  function mergeDays(days: DayPlan[]): void {
    if (!days.length) return
    set((state) => {
      if (!state.data) return {}
      const map = new Map(state.data.days.map((d) => [d.date, d]))
      for (const day of days) map.set(day.date, day)
      const merged = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
      return { data: { ...state.data, days: merged } }
    })
  }

  return {
    ready: false,
    cloudMode: false,
    adapter: null,
    syncStatus: 'local',
    busy: false,
    rooms: [],
    data: null,
    identities: {},

    async init() {
      const adapter = await createAdapter()
      adapter.onStatus((s) => set({ syncStatus: s }))
      set({
        adapter,
        ready: true,
        cloudMode: isCloudMode(),
        syncStatus: adapter.status,
        rooms: readLocalRooms(),
        identities: readIdentities(),
      })
    },

    refreshRooms() {
      set({ rooms: readLocalRooms() })
    },

    async addRoom(apartment, building, roomNumber) {
      const { adapter } = get()
      if (!adapter) return { ok: false, message: '系统还没初始化完成，请稍后重试' }

      const apt = apartment.trim()
      const bld = building.trim()
      const num = roomNumber.trim()
      if (!apt || !bld) return { ok: false, message: '请选择公寓和楼栋' }
      if (!num) return { ok: false, message: '请填写房间号' }
      if (num.length > 20) return { ok: false, message: '房间号太长了' }

      set({ busy: true })
      try {
        // 服务器上已经有这个房间就直接进去，不重复创建
        let room = await adapter.findRoom(apt, bld, num)
        if (!room) {
          const now = new Date().toISOString()
          const startDate = todayStr()
          const created: Room = {
            id: uid(),
            apartment: apt,
            building: bld,
            roomNumber: num,
            name: `${apt} ${bld} ${num}`,
            periodDays: DEFAULT_PERIOD_DAYS,
            startDate,
            endDate: defaultEndDate(startDate),
            rotationMode: 'cycle',
            createdAt: now,
          }
          const members: Member[] = DEFAULT_MEMBER_NAMES.map((name, index) => ({
            id: uid(),
            roomId: created.id,
            name,
            orderIndex: index,
            active: true,
            deletedAt: null,
            createdAt: now,
          }))
          const items: DutyItem[] = DEFAULT_DUTY_ITEMS.map((name, index) => ({
            id: uid(),
            roomId: created.id,
            name,
            orderIndex: index,
            color: pickColor(index),
            deletedAt: null,
            createdAt: now,
          }))
          await adapter.createRoom(created, members, items)
          room = created
        }

        const list = upsertLocalRoom({
          key: roomKey(apt, bld, num),
          id: room.id,
          apartment: apt,
          building: bld,
          roomNumber: num,
          name: room.name,
          lastOpenedAt: new Date().toISOString(),
        })
        set({ rooms: list })
        return { ok: true, roomId: room.id }
      } catch (err) {
        const message = err instanceof Error ? err.message : '未知错误'
        return { ok: false, message: `创建房间失败：${message}` }
      } finally {
        set({ busy: false })
      }
    },

    async enterRoom(roomId) {
      const { adapter } = get()
      if (!adapter) return
      set({ busy: true })
      try {
        const data = await adapter.loadRoom(roomId)
        if (!data) {
          set({ data: null })
          return
        }
        const list = upsertLocalRoom({
          key: roomKey(data.room.apartment, data.room.building, data.room.roomNumber),
          id: data.room.id,
          apartment: data.room.apartment,
          building: data.room.building,
          roomNumber: data.room.roomNumber,
          name: data.room.name,
          lastOpenedAt: new Date().toISOString(),
        })
        set({ data, rooms: list, identities: readIdentities() })

        // 订阅实时变化（纯本地模式下是空实现）
        roomSubscription?.()
        roomSubscription = adapter.subscribe(data.room.id, () => {
          void get().reload()
        })
      } finally {
        set({ busy: false })
      }
    },

    leaveRoom() {
      roomSubscription?.()
      roomSubscription = null
      set({ data: null })
    },

    removeLocalRoom(key) {
      set({ rooms: removeLocalRoomRef(key) })
    },

    async reload() {
      const { adapter, data } = get()
      if (!adapter || !data) return
      try {
        const fresh = await adapter.loadRoom(data.room.id)
        if (fresh) set({ data: fresh })
      } catch (err) {
        console.warn('[dorm-duty] 刷新失败', err)
      }
    },

    setIdentity(memberId) {
      const { data } = get()
      if (!data) return
      set({ identities: writeIdentity(data.room.id, memberId) })
    },

    async addMember(name) {
      const { adapter, data } = get()
      if (!adapter || !data) return
      const trimmed = name.trim()
      if (!trimmed) return
      const maxOrder = data.members.reduce((acc, m) => Math.max(acc, m.orderIndex), -1)
      const member: Member = {
        id: uid(),
        roomId: data.room.id,
        name: trimmed,
        orderIndex: maxOrder + 1,
        active: true,
        deletedAt: null,
        createdAt: new Date().toISOString(),
      }
      set({ data: { ...data, members: [...data.members, member] } })
      await adapter.saveMembers([member])

      // 规则：新成员从「下一个周期」开始参与轮换，当前周期不动
      const { startDate, endDate, periodDays } = data.room
      const today = todayStr()
      if (data.days.length > 0 && today <= endDate) {
        const current = today < startDate ? -1 : cycleIndexOf(today, startDate, periodDays)
        const from = current + 1
        const start = cycleRange(startDate, periodDays, from).start
        if (start <= endDate) {
          await get().regenerateFromCycle(from)
          await addLogEntry(
            'member',
            `新增成员「${trimmed}」，从第 ${from + 1} 轮（${start} 起）加入轮换`,
            null,
            null,
            { member },
          )
          return
        }
      }
      await addLogEntry('member', `新增成员「${trimmed}」`, null, null, { member })
    },

    async updateMember(id, patch) {
      const { adapter, data } = get()
      if (!adapter || !data) return
      const before = data.members.find((m) => m.id === id)
      if (!before) return
      const next: Member = { ...before, ...patch, id }
      set({ data: { ...data, members: data.members.map((m) => (m.id === id ? next : m)) } })
      await adapter.saveMembers([next])

      let detail = `更新成员「${next.name}」`
      if (patch.name !== undefined && patch.name !== before.name) {
        detail = `成员改名：${before.name} → ${next.name}`
      } else if (patch.active !== undefined && patch.active !== before.active) {
        detail = `${next.name} ${next.active ? '已启用' : '已停用'}`
      }
      await addLogEntry('member', detail, null, before, next)
    },

    async removeMember(id) {
      const { adapter, data } = get()
      if (!adapter || !data) return
      const before = data.members.find((m) => m.id === id)
      if (!before) return
      const next: Member = { ...before, active: false, deletedAt: new Date().toISOString() }
      set({ data: { ...data, members: data.members.map((m) => (m.id === id ? next : m)) } })
      await adapter.saveMembers([next])
      await addLogEntry('member', `删除成员「${before.name}」（历史记录仍保留其姓名）`, null, before, next)
    },

    async reorderMembers(orderedIds) {
      const { adapter, data } = get()
      if (!adapter || !data) return
      const next = reorderBy(data.members, orderedIds)
      set({ data: { ...data, members: next } })
      await adapter.saveMembers(next)
      await addLogEntry('member', '调整成员顺序', null, null, { order: orderedIds })
    },

    async addDutyItem(name) {
      const { adapter, data } = get()
      if (!adapter || !data) return
      const trimmed = name.trim()
      if (!trimmed) return
      const maxOrder = data.dutyItems.reduce((acc, i) => Math.max(acc, i.orderIndex), -1)
      const item: DutyItem = {
        id: uid(),
        roomId: data.room.id,
        name: trimmed,
        orderIndex: maxOrder + 1,
        color: pickColor(maxOrder + 1),
        deletedAt: null,
        createdAt: new Date().toISOString(),
      }
      set({ data: { ...data, dutyItems: [...data.dutyItems, item] } })
      await adapter.saveItems([item])
      await addLogEntry('item', `新增值日内容「${trimmed}」`, null, null, { item })
    },

    async updateDutyItem(id, patch) {
      const { adapter, data } = get()
      if (!adapter || !data) return
      const before = data.dutyItems.find((i) => i.id === id)
      if (!before) return
      const next: DutyItem = { ...before, ...patch, id }
      set({ data: { ...data, dutyItems: data.dutyItems.map((i) => (i.id === id ? next : i)) } })
      await adapter.saveItems([next])
      await addLogEntry('item', `更新值日内容「${next.name}」`, null, before, next)
    },

    async removeDutyItem(id) {
      const { adapter, data } = get()
      if (!adapter || !data) return
      const before = data.dutyItems.find((i) => i.id === id)
      if (!before) return
      if (data.dutyItems.filter((i) => !i.deletedAt).length <= 1) return
      const next: DutyItem = { ...before, deletedAt: new Date().toISOString() }
      set({ data: { ...data, dutyItems: data.dutyItems.map((i) => (i.id === id ? next : i)) } })
      await adapter.saveItems([next])
      await addLogEntry('item', `删除值日内容「${before.name}」（历史记录仍可查看）`, null, before, next)
    },

    async reorderDutyItems(orderedIds) {
      const { adapter, data } = get()
      if (!adapter || !data) return
      const live = liveItems(data.dutyItems)
      const map = new Map(live.map((i) => [i.id, i]))
      const next: DutyItem[] = []
      orderedIds.forEach((id, index) => {
        const item = map.get(id)
        if (item) next.push({ ...item, orderIndex: index })
      })
      set((state) =>
        state.data
          ? {
              data: {
                ...state.data,
                dutyItems: state.data.dutyItems.map((i) => next.find((n) => n.id === i.id) ?? i),
              },
            }
          : {},
      )
      await adapter.saveItems(next)
      await addLogEntry('item', '调整值日内容顺序', null, null, { order: orderedIds })
    },

    async updateRoomSettings(patch) {
      const { adapter, data } = get()
      if (!adapter || !data) return
      const before = data.room
      const next: Room = { ...before, ...patch, id: before.id }
      set({ data: { ...data, room: next } })
      await adapter.updateRoom(next.id, next)

      // 周期结构变了（开始日期或周期天数），旧的周期划分全部作废
      const structural = patch.startDate !== undefined || patch.periodDays !== undefined
      const hadPlans = data.days.length > 0
      if (structural && hadPlans) {
        await adapter.clearPlansFrom(next.id, '0001-01-01')
        set((state) => (state.data ? { data: { ...state.data, days: [] } } : {}))
      }
      await addLogEntry(
        'settings',
        structural && hadPlans ? '修改周期设置，已生成的排班已清空，需重新生成' : '修改房间设置',
        null,
        before,
        next,
      )
    },

    async generateAll() {
      const { adapter, data } = get()
      if (!adapter || !data) return
      const { startDate, endDate, periodDays } = data.room
      if (startDate > endDate) throw new Error('开始日期不能晚于结束日期')
      const members = activeMembers(data.members)
      const items = liveItems(data.dutyItems)
      if (members.length === 0) throw new Error('请先添加至少一名成员')
      if (items.length === 0) throw new Error('请先添加至少一项值日内容')

      set({ busy: true })
      try {
        const plans = buildPlans(members, items, startDate, periodDays, startDate, endDate)
        await adapter.savePlans(data.room.id, plans)
        mergeDays(plans)
        const cycles = plans.length ? plans[plans.length - 1].cycleIndex + 1 : 0
        await addLogEntry(
          'generate',
          `自动排班：${startDate} 至 ${endDate}，共 ${plans.length} 天 / ${cycles} 个周期`,
          startDate,
          null,
          { days: plans.length, cycles },
        )
      } finally {
        set({ busy: false })
      }
    },

    async regenerateFromCycle(cycleIndex) {
      const { adapter, data } = get()
      if (!adapter || !data) return
      const members = activeMembers(data.members)
      const items = liveItems(data.dutyItems)
      if (!members.length || !items.length) return
      const plans = rebuildFromCycle(members, items, data.room, cycleIndex)
      if (!plans.length) return
      await adapter.savePlans(data.room.id, plans)
      mergeDays(plans)
    },

    async adjust(date, slots, scope) {
      const { adapter, data } = get()
      if (!adapter || !data) return
      const { startDate, endDate, periodDays } = data.room
      const cycleIndex = cycleIndexOf(date, startDate, periodDays)
      const beforeDay = data.days.find((d) => d.date === date)
      const beforeSlots = beforeDay?.slots ?? []
      const manualSlots: Slot[] = slots.map((s) => ({ ...s, isManual: true }))

      const memberName = (id: string) => data.members.find((m) => m.id === id)?.name ?? '未知成员'
      const itemName = (id: string) => data.dutyItems.find((i) => i.id === id)?.name ?? '未知值日项'
      const detail = describeDiff(memberName, itemName, beforeSlots, manualSlots)

      set({ busy: true })
      try {
        if (scope === 'day') {
          const plans: DayPlan[] = [{ date, cycleIndex, slots: manualSlots }]
          await adapter.savePlans(data.room.id, plans)
          mergeDays(plans)
          await addLogEntry('adjust', `${date} 调整（仅当天）：${detail}`, date, beforeSlots, manualSlots)
          return
        }

        if (scope === 'cycle') {
          const plans = slotsOfCycleDate(startDate, periodDays, date, manualSlots, endDate)
          await adapter.savePlans(data.room.id, plans)
          mergeDays(plans)
          const range = cycleRange(startDate, periodDays, cycleIndex)
          await addLogEntry(
            'adjust',
            `第 ${cycleIndex + 1} 轮（${range.start} ~ ${range.end}）调整：${detail}`,
            date,
            beforeSlots,
            manualSlots,
          )
          return
        }

        // 「从此以后」：先反推新的成员顺序基线，再重排本轮及以后
        const members = activeMembers(data.members)
        const items = liveItems(data.dutyItems)
        const baseline = deriveBaseline(members, items, cycleIndex, manualSlots)
        const reordered = reorderBy(data.members, baseline)
        set((state) => (state.data ? { data: { ...state.data, members: reordered } } : {}))
        await adapter.saveMembers(reordered)

        const future = rebuildFromCycle(activeMembers(reordered), items, data.room, cycleIndex)
        // 本轮用用户编辑的结果覆盖，保证「所见即所得」
        const firstCycle = slotsOfCycleDate(startDate, periodDays, date, manualSlots, endDate)
        const firstDates = new Set(firstCycle.map((p) => p.date))
        const merged = [...future.filter((p) => !firstDates.has(p.date)), ...firstCycle].sort((a, b) =>
          a.date.localeCompare(b.date),
        )
        await adapter.savePlans(data.room.id, merged)
        mergeDays(merged)
        await addLogEntry(
          'adjust',
          `第 ${cycleIndex + 1} 轮起更新轮换基线：${detail}`,
          date,
          beforeSlots,
          manualSlots,
        )
      } finally {
        set({ busy: false })
      }
    },

    async importRoom(payload) {
      const { adapter, data } = get()
      if (!adapter) return null
      const { room, members, dutyItems, days } = payload
      const existing = await adapter.findRoom(room.apartment, room.building, room.roomNumber)
      const targetId = existing?.id ?? room.id

      if (existing) {
        // 1) 先把原有排班全部清掉，避免和导入的数据混在一起
        await adapter.clearPlansFrom(targetId, '0001-01-01')

        // 2) 导入的正是当前打开的这个房间时，把原有的成员和值日项整体停用。
        //    否则两边 id 不同，saveMembers 只会「新增」，
        //    结果房间里会同时存在两套人（比如变成 10 个人）。
        if (data && data.room.id === targetId) {
          const stamp = new Date().toISOString()
          const importedMemberIds = new Set(members.map((m) => m.id))
          const importedItemIds = new Set(dutyItems.map((i) => i.id))
          const retiredMembers = data.members
            .filter((m) => !m.deletedAt && !importedMemberIds.has(m.id))
            .map((m) => ({ ...m, active: false, deletedAt: stamp }))
          const retiredItems = data.dutyItems
            .filter((i) => !i.deletedAt && !importedItemIds.has(i.id))
            .map((i) => ({ ...i, deletedAt: stamp }))
          if (retiredMembers.length) await adapter.saveMembers(retiredMembers)
          if (retiredItems.length) await adapter.saveItems(retiredItems)
        }

        await adapter.saveMembers(members)
        await adapter.saveItems(dutyItems)
      } else {
        await adapter.createRoom({ ...room, id: targetId }, members, dutyItems)
      }
      if (days.length) await adapter.savePlans(targetId, days)

      const ref: LocalRoomRef = {
        key: roomKey(room.apartment, room.building, room.roomNumber),
        id: targetId,
        apartment: room.apartment,
        building: room.building,
        roomNumber: room.roomNumber,
        name: room.name,
        lastOpenedAt: new Date().toISOString(),
      }
      set({ rooms: upsertLocalRoom(ref) })
      return targetId
    },
  }
})

/** 选择器：取「我」对应的成员（没设置或成员已被删就返回 null） */
export function useMyMember(): Member | null {
  const data = useAppStore((s) => s.data)
  const identities = useAppStore((s) => s.identities)
  if (!data) return null
  const id = identities[data.room.id]
  if (!id) return null
  return data.members.find((m) => m.id === id && !m.deletedAt) ?? null
}
