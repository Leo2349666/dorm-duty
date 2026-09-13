import { STORAGE_KEYS } from '../lib/constants'
import { uid } from '../lib/uid'
import type { ChangeLog, DayPlan, DutyItem, Member, Room, RoomData } from '../types'
import type { DataAdapter, SyncStatus } from './types'

/**
 * ============================================================================
 * 纯本地适配器（降级模式）
 * ============================================================================
 *
 * 数据全部存在浏览器的 localStorage 里。
 *
 * 说清楚它的边界，避免误解：
 *  ✅ 打开链接就能用，零配置，不需要任何后端
 *  ✅ 同一个浏览器里刷新、关掉重开，数据都还在
 *  ❌ 换设备、换浏览器、清缓存、用无痕模式 → 数据看不到
 *  ❌ 无法多设备实时同步
 *
 * 跨设备搬家请用「设置 → 导出 JSON / 导入 JSON」。
 */

interface LocalScheduleRow {
  id: string
  roomId: string
  date: string
  cycleIndex: number
}

interface LocalAssignmentRow {
  id: string
  scheduleId: string
  memberId: string
  dutyItemId: string
  isManual: boolean
  note: string | null
}

interface LocalDb {
  version: number
  rooms: Room[]
  members: Member[]
  dutyItems: DutyItem[]
  schedules: LocalScheduleRow[]
  assignments: LocalAssignmentRow[]
  logs: ChangeLog[]
}

function emptyDb(): LocalDb {
  return { version: 1, rooms: [], members: [], dutyItems: [], schedules: [], assignments: [], logs: [] }
}

function readDb(): LocalDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.db)
    if (!raw) return emptyDb()
    const parsed = JSON.parse(raw) as LocalDb
    return {
      version: 1,
      rooms: parsed.rooms ?? [],
      members: parsed.members ?? [],
      dutyItems: parsed.dutyItems ?? [],
      schedules: parsed.schedules ?? [],
      assignments: parsed.assignments ?? [],
      logs: parsed.logs ?? [],
    }
  } catch {
    // 数据损坏时不要让页面白屏，直接当作空库
    return emptyDb()
  }
}

function writeDb(db: LocalDb): void {
  try {
    localStorage.setItem(STORAGE_KEYS.db, JSON.stringify(db))
  } catch (err) {
    // 手机浏览器 localStorage 通常只有 5MB，写满时需要让用户知道
    console.error('[dorm-duty] 本地存储写入失败，可能是空间已满', err)
    // 会话内的操作不应该因为落盘失败而中断，所以这里不抛出
  }
}

export class LocalAdapter implements DataAdapter {
  readonly mode = 'local' as const
  private _status: SyncStatus = 'local'
  private db: LocalDb = emptyDb()
  private listeners = new Set<(s: SyncStatus) => void>()

  get status(): SyncStatus {
    return this._status
  }

  async init(): Promise<void> {
    this.db = readDb()
    this.setStatus('local')
  }

  onStatus(cb: (s: SyncStatus) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private setStatus(s: SyncStatus): void {
    this._status = s
    this.listeners.forEach((cb) => cb(s))
  }

  private persist(): void {
    writeDb(this.db)
  }

  async findRoom(apartment: string, building: string, roomNumber: string): Promise<Room | null> {
    const found = this.db.rooms.find(
      (r) => r.apartment === apartment && r.building === building && r.roomNumber === roomNumber,
    )
    return found ? { ...found } : null
  }

  async getRoom(roomId: string): Promise<Room | null> {
    const found = this.db.rooms.find((r) => r.id === roomId)
    return found ? { ...found } : null
  }

  async createRoom(room: Room, members: Member[], items: DutyItem[]): Promise<void> {
    this.db.rooms.push(room)
    this.db.members.push(...members)
    this.db.dutyItems.push(...items)
    this.persist()
  }

  async updateRoom(roomId: string, patch: Partial<Room>): Promise<void> {
    const idx = this.db.rooms.findIndex((r) => r.id === roomId)
    if (idx >= 0) {
      this.db.rooms[idx] = { ...this.db.rooms[idx], ...patch, id: roomId }
      this.persist()
    }
  }

  async loadRoom(roomId: string): Promise<RoomData | null> {
    this.db = readDb() // 每次都重新读，保证多标签页之间不会互相覆盖
    const room = this.db.rooms.find((r) => r.id === roomId)
    if (!room) return null

    const schedules = this.db.schedules
      .filter((s) => s.roomId === roomId)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))

    const scheduleIds = new Set(schedules.map((s) => s.id))
    const assignments = this.db.assignments.filter((a) => scheduleIds.has(a.scheduleId))

    const days: DayPlan[] = schedules.map((s) => ({
      date: s.date,
      cycleIndex: s.cycleIndex,
      slots: assignments
        .filter((a) => a.scheduleId === s.id)
        .map((a) => ({
          memberId: a.memberId,
          dutyItemId: a.dutyItemId,
          isManual: a.isManual,
          note: a.note,
        })),
    }))

    return {
      room: { ...room },
      members: this.db.members.filter((m) => m.roomId === roomId).map((m) => ({ ...m })),
      dutyItems: this.db.dutyItems.filter((i) => i.roomId === roomId).map((i) => ({ ...i })),
      days,
      logs: this.db.logs
        .filter((l) => l.roomId === roomId)
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }
  }

  async saveMembers(rows: Member[]): Promise<void> {
    for (const row of rows) {
      const idx = this.db.members.findIndex((m) => m.id === row.id)
      if (idx >= 0) this.db.members[idx] = { ...row }
      else this.db.members.push({ ...row })
    }
    this.persist()
  }

  async saveItems(rows: DutyItem[]): Promise<void> {
    for (const row of rows) {
      const idx = this.db.dutyItems.findIndex((i) => i.id === row.id)
      if (idx >= 0) this.db.dutyItems[idx] = { ...row }
      else this.db.dutyItems.push({ ...row })
    }
    this.persist()
  }

  async savePlans(roomId: string, plans: DayPlan[]): Promise<void> {
    if (plans.length === 0) return
    const dates = new Set(plans.map((p) => p.date))

    // 先删掉这些日期上的旧排班（连带旧的 assignments）
    const removedScheduleIds = new Set(
      this.db.schedules.filter((s) => s.roomId === roomId && dates.has(s.date)).map((s) => s.id),
    )
    this.db.schedules = this.db.schedules.filter((s) => !removedScheduleIds.has(s.id))
    this.db.assignments = this.db.assignments.filter((a) => !removedScheduleIds.has(a.scheduleId))

    // 再写入新的
    for (const plan of plans) {
      const scheduleId = uid()
      this.db.schedules.push({ id: scheduleId, roomId, date: plan.date, cycleIndex: plan.cycleIndex })
      for (const slot of plan.slots) {
        this.db.assignments.push({
          id: uid(),
          scheduleId,
          memberId: slot.memberId,
          dutyItemId: slot.dutyItemId,
          isManual: slot.isManual,
          note: slot.note ?? null,
        })
      }
    }
    this.persist()
  }

  async clearPlansFrom(roomId: string, fromDate: string): Promise<void> {
    const removed = new Set(
      this.db.schedules.filter((s) => s.roomId === roomId && s.date >= fromDate).map((s) => s.id),
    )
    this.db.schedules = this.db.schedules.filter((s) => !removed.has(s.id))
    this.db.assignments = this.db.assignments.filter((a) => !removed.has(a.scheduleId))
    this.persist()
  }

  async addLog(log: ChangeLog): Promise<void> {
    this.db.logs.push(log)
    // 本地模式下历史记录只留最近 300 条，避免把 localStorage 撑爆
    if (this.db.logs.length > 300) {
      this.db.logs = this.db.logs.slice(-300)
    }
    this.persist()
  }

  // 本地模式没有别人能改数据，所以订阅是空实现
  subscribe(_roomId: string, _cb: () => void): () => void {
    return () => {}
  }

  /** 导出整库（给「导出 JSON」用） */
  dumpRoom(roomId: string): unknown {
    const db = readDb()
    const scheduleIds = new Set(db.schedules.filter((s) => s.roomId === roomId).map((s) => s.id))
    return {
      room: db.rooms.find((r) => r.id === roomId) ?? null,
      members: db.members.filter((m) => m.roomId === roomId),
      dutyItems: db.dutyItems.filter((i) => i.roomId === roomId),
      schedules: db.schedules.filter((s) => s.roomId === roomId),
      assignments: db.assignments.filter((a) => scheduleIds.has(a.scheduleId)),
      logs: db.logs.filter((l) => l.roomId === roomId),
    }
  }
}
