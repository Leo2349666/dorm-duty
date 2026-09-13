import { STORAGE_KEYS } from '../lib/constants'
import { debounce } from '../lib/uid'
import type { ChangeLog, DayPlan, DutyItem, Member, Room, RoomData } from '../types'
import type { DataAdapter, SyncStatus } from './types'

type SB = {
  auth: {
    getSession: () => Promise<{ data: { session: unknown | null } }>
    signInAnonymously: () => Promise<{ error: { message: string } | null }>
  }
  from: (table: string) => any
  channel: (name: string) => any
  removeChannel: (channel: any) => void
}

/**
 * ============================================================================
 * Supabase 适配器（云端同步模式）
 * ============================================================================
 *
 * 只有 .env 里同时填了 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY 时才会启用。
 *
 * 同步策略：
 *  1. 启动时做一次**匿名登录**（用户无感知，不需要注册），拿到 authenticated 身份。
 *  2. 进入房间时拉一次全量数据，之后通过 Realtime 订阅增量变化自动刷新。
 *  3. 所有写操作都是「先写云端，失败就进本地队列」，联网后自动补传，
 *     顶部会显示「离线（N 项待同步）」，不会静默丢数据。
 *
 * 安全说明（README 里也会再讲一遍）：
 *  房间是由「公寓 + 楼栋 + 房间号」明码标识的，也就是说知道房间号的人可以进来。
 *  值日表本身不是敏感信息，所以默认没做额外口令。如果你需要，可以后续加。
 */

type AnyRow = Record<string, unknown>

type Op =
  | { kind: 'createRoom'; room: Room; members: Member[]; items: DutyItem[] }
  | { kind: 'updateRoom'; roomId: string; patch: Partial<Room> }
  | { kind: 'saveMembers'; rows: Member[] }
  | { kind: 'saveItems'; rows: DutyItem[] }
  | { kind: 'savePlans'; roomId: string; plans: DayPlan[] }
  | { kind: 'clearPlansFrom'; roomId: string; fromDate: string }
  | { kind: 'addLog'; log: ChangeLog }

// ---------------------------------------------------------------------------
// camelCase <-> snake_case 映射
// 前端全程用 camelCase，进数据库前统一转换，避免到处写两套字段名。
// ---------------------------------------------------------------------------

function toRoomRow(room: Room): AnyRow {
  return {
    id: room.id,
    apartment: room.apartment,
    building: room.building,
    room_number: room.roomNumber,
    name: room.name,
    period_days: room.periodDays,
    start_date: room.startDate,
    end_date: room.endDate,
    rotation_mode: room.rotationMode,
  }
}

function fromRoomRow(row: AnyRow): Room {
  return {
    id: String(row.id),
    apartment: String(row.apartment),
    building: String(row.building),
    roomNumber: String(row.room_number),
    name: String(row.name),
    periodDays: Number(row.period_days),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    rotationMode: 'cycle',
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

function toMemberRow(m: Member): AnyRow {
  return {
    id: m.id,
    room_id: m.roomId,
    name: m.name,
    order_index: m.orderIndex,
    active: m.active,
    deleted_at: m.deletedAt,
  }
}

function fromMemberRow(row: AnyRow): Member {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    name: String(row.name),
    orderIndex: Number(row.order_index ?? 0),
    active: Boolean(row.active),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

function toItemRow(i: DutyItem): AnyRow {
  return {
    id: i.id,
    room_id: i.roomId,
    name: i.name,
    order_index: i.orderIndex,
    color: i.color,
    deleted_at: i.deletedAt,
  }
}

function fromItemRow(row: AnyRow): DutyItem {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    name: String(row.name),
    orderIndex: Number(row.order_index ?? 0),
    color: String(row.color ?? '#3b82f6'),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

function toLogRow(log: ChangeLog): AnyRow {
  return {
    id: log.id,
    room_id: log.roomId,
    date: log.date,
    action: log.action,
    summary: log.summary,
    before_json: log.before ?? null,
    after_json: log.after ?? null,
    created_at: log.createdAt,
  }
}

function fromLogRow(row: AnyRow): ChangeLog {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    date: row.date ? String(row.date) : null,
    action: String(row.action) as ChangeLog['action'],
    summary: String(row.summary ?? ''),
    before: row.before_json ?? null,
    after: row.after_json ?? null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

/** 把大数组切成小块，避免单次请求体过大被 Supabase 拒绝 */
function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export class SupabaseAdapter implements DataAdapter {
  readonly mode = 'supabase' as const
  private _status: SyncStatus = 'syncing'
  private sb: SB
  private listeners = new Set<(s: SyncStatus) => void>()
  private pending: Op[] = []
  private flushing = false
  private signedIn = false

  constructor(sb: SB) {
    this.sb = sb
    this.pending = this.readPending()
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        void this.flush()
      })
    }
  }

  get status(): SyncStatus {
    return this._status
  }

  /** 还没补传的操作条数，界面上会显示「离线（N 项待同步）」 */
  get pendingCount(): number {
    return this.pending.length
  }

  onStatus(cb: (s: SyncStatus) => void): () => void {
    this.listeners.add(cb)
    cb(this._status)
    return () => this.listeners.delete(cb)
  }

  private setStatus(s: SyncStatus): void {
    this._status = s
    this.listeners.forEach((cb) => cb(s))
  }

  private readPending(): Op[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.pending)
      return raw ? (JSON.parse(raw) as Op[]) : []
    } catch {
      return []
    }
  }

  private writePending(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.pending, JSON.stringify(this.pending))
    } catch {
      /* 忽略：队列落盘失败不影响本次会话 */
    }
  }

  async init(): Promise<void> {
    this.setStatus('syncing')
    try {
      const { data } = await this.sb.auth.getSession()
      if (!data.session) {
        const { error } = await this.sb.auth.signInAnonymously()
        if (error) throw new Error(error.message)
      }
      this.signedIn = true
      await this.flush()
      this.setStatus(this.pending.length > 0 ? 'offline' : 'synced')
    } catch (err) {
      console.error('[dorm-duty] Supabase 初始化失败，已降级为「离线」状态', err)
      this.setStatus('offline')
    }
  }

  // -------------------------------------------------------------------------
  // 写操作：统一走 run()，失败就进队列
  // -------------------------------------------------------------------------

  private async run(op: Op): Promise<void> {
    switch (op.kind) {
      case 'createRoom': {
        const { error } = await this.sb.from('rooms').insert(toRoomRow(op.room))
        // 房间已存在（唯一约束冲突）时不算失败，直接进入即可
        if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message)
        if (op.members.length) {
          const { error: e2 } = await this.sb.from('members').upsert(op.members.map(toMemberRow))
          if (e2) throw new Error(e2.message)
        }
        if (op.items.length) {
          const { error: e3 } = await this.sb.from('duty_items').upsert(op.items.map(toItemRow))
          if (e3) throw new Error(e3.message)
        }
        return
      }
      case 'updateRoom': {
        const { error } = await this.sb.from('rooms').update(toRoomRow(op.patch as Room)).eq('id', op.roomId)
        if (error) throw new Error(error.message)
        return
      }
      case 'saveMembers': {
        if (!op.rows.length) return
        const { error } = await this.sb.from('members').upsert(op.rows.map(toMemberRow))
        if (error) throw new Error(error.message)
        return
      }
      case 'saveItems': {
        if (!op.rows.length) return
        const { error } = await this.sb.from('duty_items').upsert(op.rows.map(toItemRow))
        if (error) throw new Error(error.message)
        return
      }
      case 'savePlans': {
        await this.writePlans(op.roomId, op.plans)
        return
      }
      case 'clearPlansFrom': {
        const { error } = await this.sb
          .from('schedules')
          .delete()
          .eq('room_id', op.roomId)
          .gte('date', op.fromDate)
        if (error) throw new Error(error.message)
        return
      }
      case 'addLog': {
        const { error } = await this.sb.from('change_logs').insert(toLogRow(op.log))
        if (error) throw new Error(error.message)
        return
      }
    }
  }

  private async exec(op: Op): Promise<void> {
    this.setStatus('syncing')
    try {
      await this.run(op)
      this.setStatus(this.pending.length > 0 ? 'offline' : 'synced')
    } catch (err) {
      console.warn('[dorm-duty] 写入云端失败，已加入待同步队列', err)
      this.pending.push(op)
      this.writePending()
      this.setStatus('offline')
    }
  }

  /** 联网后把积压的操作按顺序重放 */
  async flush(): Promise<void> {
    if (this.flushing || this.pending.length === 0 || !this.signedIn) return
    this.flushing = true
    this.setStatus('syncing')
    const queue = [...this.pending]
    this.pending = []
    this.writePending()
    for (const op of queue) {
      try {
        await this.run(op)
      } catch (err) {
        console.warn('[dorm-duty] 补传失败，保留在队列里稍后重试', err)
        this.pending.push(op)
      }
    }
    this.writePending()
    this.flushing = false
    this.setStatus(this.pending.length > 0 ? 'offline' : 'synced')
  }

  // -------------------------------------------------------------------------
  // 读操作
  // -------------------------------------------------------------------------

  async findRoom(apartment: string, building: string, roomNumber: string): Promise<Room | null> {
    const { data, error } = await this.sb
      .from('rooms')
      .select('*')
      .eq('apartment', apartment)
      .eq('building', building)
      .eq('room_number', roomNumber)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? fromRoomRow(data as AnyRow) : null
  }

  async getRoom(roomId: string): Promise<Room | null> {
    const { data, error } = await this.sb.from('rooms').select('*').eq('id', roomId).maybeSingle()
    if (error) throw new Error(error.message)
    return data ? fromRoomRow(data as AnyRow) : null
  }

  async createRoom(room: Room, members: Member[], items: DutyItem[]): Promise<void> {
    await this.exec({ kind: 'createRoom', room, members, items })
  }

  async updateRoom(roomId: string, patch: Partial<Room>): Promise<void> {
    await this.exec({ kind: 'updateRoom', roomId, patch })
  }

  async loadRoom(roomId: string): Promise<RoomData | null> {
    const { data: roomRow, error: roomErr } = await this.sb
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .maybeSingle()
    if (roomErr) throw new Error(roomErr.message)
    if (!roomRow) return null

    const [membersRes, itemsRes, schedulesRes, logsRes] = await Promise.all([
      this.sb.from('members').select('*').eq('room_id', roomId),
      this.sb.from('duty_items').select('*').eq('room_id', roomId),
      this.sb.from('schedules').select('*').eq('room_id', roomId).order('date', { ascending: true }),
      this.sb
        .from('change_logs')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(200),
    ])
    for (const res of [membersRes, itemsRes, schedulesRes, logsRes]) {
      if (res.error) throw new Error(res.error.message)
    }

    const scheduleRows = (schedulesRes.data ?? []) as AnyRow[]
    const scheduleIds = scheduleRows.map((s) => String(s.id))

    // assignments 可能很多（一学期 600+ 条），分批拉取
    const assignmentRows: AnyRow[] = []
    for (const ids of chunk(scheduleIds, 100)) {
      const { data, error } = await this.sb.from('assignments').select('*').in('schedule_id', ids)
      if (error) throw new Error(error.message)
      assignmentRows.push(...((data ?? []) as AnyRow[]))
    }

    const bySchedule = new Map<string, AnyRow[]>()
    for (const row of assignmentRows) {
      const key = String(row.schedule_id)
      const list = bySchedule.get(key)
      if (list) list.push(row)
      else bySchedule.set(key, [row])
    }

    const days: DayPlan[] = scheduleRows.map((s) => ({
      date: String(s.date),
      cycleIndex: Number(s.cycle_index),
      slots: (bySchedule.get(String(s.id)) ?? []).map((a) => ({
        memberId: String(a.member_id),
        dutyItemId: String(a.duty_item_id),
        isManual: Boolean(a.is_manual),
        note: a.note ? String(a.note) : null,
      })),
    }))

    return {
      room: fromRoomRow(roomRow as AnyRow),
      members: ((membersRes.data ?? []) as AnyRow[]).map(fromMemberRow),
      dutyItems: ((itemsRes.data ?? []) as AnyRow[]).map(fromItemRow),
      days,
      logs: ((logsRes.data ?? []) as AnyRow[]).map(fromLogRow),
    }
  }

  private async writePlans(roomId: string, plans: DayPlan[]): Promise<void> {
    if (!plans.length) return
    const dates = plans.map((p) => p.date)

    // 先删后插：schedules 上的 assignments 有 ON DELETE CASCADE，会跟着一起清掉
    const { error: delErr } = await this.sb
      .from('schedules')
      .delete()
      .eq('room_id', roomId)
      .in('date', dates)
    if (delErr) throw new Error(delErr.message)

    const { data, error } = await this.sb
      .from('schedules')
      .insert(plans.map((p) => ({ room_id: roomId, date: p.date, cycle_index: p.cycleIndex })))
      .select('id, date')
    if (error) throw new Error(error.message)

    const idByDate = new Map<string, string>()
    for (const row of (data ?? []) as AnyRow[]) idByDate.set(String(row.date), String(row.id))

    const assignments: AnyRow[] = []
    for (const plan of plans) {
      const scheduleId = idByDate.get(plan.date)
      if (!scheduleId) continue
      for (const slot of plan.slots) {
        assignments.push({
          schedule_id: scheduleId,
          member_id: slot.memberId,
          duty_item_id: slot.dutyItemId,
          is_manual: slot.isManual,
          note: slot.note ?? null,
        })
      }
    }
    for (const batch of chunk(assignments, 400)) {
      const { error: e2 } = await this.sb.from('assignments').insert(batch)
      if (e2) throw new Error(e2.message)
    }
  }

  async saveMembers(rows: Member[]): Promise<void> {
    await this.exec({ kind: 'saveMembers', rows })
  }

  async saveItems(rows: DutyItem[]): Promise<void> {
    await this.exec({ kind: 'saveItems', rows })
  }

  async savePlans(roomId: string, plans: DayPlan[]): Promise<void> {
    await this.exec({ kind: 'savePlans', roomId, plans })
  }

  async clearPlansFrom(roomId: string, fromDate: string): Promise<void> {
    await this.exec({ kind: 'clearPlansFrom', roomId, fromDate })
  }

  async addLog(log: ChangeLog): Promise<void> {
    await this.exec({ kind: 'addLog', log })
  }

  /**
   * 订阅房间内的数据变化。
   *
   * 说明：这里只订阅 members / duty_items / schedules / rooms / change_logs。
   * assignments 的变动一定伴随 schedules 行的删除重建（见 writePlans），
   * 所以订阅 schedules 就够了，少订阅一张表能显著减少手机上的推送开销。
   */
  subscribe(roomId: string, cb: () => void): () => void {
    const trigger = debounce(cb, 400)
    const channel = this.sb
      .channel(`room-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'members', filter: `room_id=eq.${roomId}` },
        trigger,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'duty_items', filter: `room_id=eq.${roomId}` },
        trigger,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'schedules', filter: `room_id=eq.${roomId}` },
        trigger,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'change_logs', filter: `room_id=eq.${roomId}` },
        trigger,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        trigger,
      )
      .subscribe()

    return () => {
      try {
        this.sb.removeChannel(channel)
      } catch {
        /* 忽略 */
      }
    }
  }
}
