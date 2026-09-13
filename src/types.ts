/**
 * 全局数据类型定义。
 *
 * 命名约定：前端内部一律用 camelCase；与 Supabase 数据库之间
 * 的 snake_case 转换统一在 src/data/supabase.ts 里处理，
 * 其它任何地方都不需要关心数据库列名。
 */

/** 房间（公寓 + 楼栋 + 房间号 三者唯一确定一个房间） */
export interface Room {
  id: string
  apartment: string
  building: string
  roomNumber: string
  /** 展示用名称，例如「学士苑 1号楼 101」 */
  name: string
  /** 排班周期天数，默认 7（一周）。1 表示每天轮换 */
  periodDays: number
  /** 第一次排班的开始日期，YYYY-MM-DD */
  startDate: string
  /** 排班的结束日期，YYYY-MM-DD */
  endDate: string
  /** 轮换模式，目前只有 'cycle'（按周期轮换）一种 */
  rotationMode: 'cycle'
  createdAt: string
}

/** 寝室成员 */
export interface Member {
  id: string
  roomId: string
  name: string
  /** 排序号，越小越靠前。排班算法直接依赖这个顺序 */
  orderIndex: number
  /** 是否参与排班。停用后历史保留，但不再被分配值日 */
  active: boolean
  /** 软删除时间。删除成员不物理删行，保证历史排班还能查到名字 */
  deletedAt: string | null
  createdAt: string
}

/** 值日内容（阳台 / 地面 / 倒垃圾 …） */
export interface DutyItem {
  id: string
  roomId: string
  name: string
  orderIndex: number
  /** 标签颜色，新建时自动从调色板分配，用户可改 */
  color: string
  /** 软删除时间，理由同 Member.deletedAt */
  deletedAt: string | null
  createdAt: string
}

/** 单条「谁负责哪项」的配对 */
export interface Slot {
  memberId: string
  dutyItemId: string
  /** 是否为手动调整产生，用于日历上打标记 */
  isManual: boolean
  note?: string | null
}

/**
 * 某一天的完整排班。
 *
 * 注意：按规则，同一周期内每一天的 slots 是完全一样的。
 * 之所以还是按天存，是为了让「仅今天调整」这类操作有地方落。
 */
export interface DayPlan {
  date: string
  cycleIndex: number
  slots: Slot[]
}

/** 历史记录 */
export interface ChangeLog {
  id: string
  roomId: string
  /** 关联的日期（若有）。用日期而不是 schedule_id，前端更直观 */
  date: string | null
  /** 动作类型 */
  action: 'generate' | 'adjust' | 'reset' | 'settings' | 'member' | 'item' | 'import'
  /** 人类可读的描述 */
  summary: string
  before: unknown
  after: unknown
  createdAt: string
}

/** 一个房间的全部数据 */
export interface RoomData {
  room: Room
  members: Member[]
  dutyItems: DutyItem[]
  /** 已生成的排班，按日期升序 */
  days: DayPlan[]
  logs: ChangeLog[]
}

/** 本机保存的「我加过的房间」记录 */
export interface LocalRoomRef {
  /** 唯一键：公寓|楼栋|房间号，用于本地去重 */
  key: string
  id: string
  apartment: string
  building: string
  roomNumber: string
  name: string
  /** 最后一次进入的时间，用于排序 */
  lastOpenedAt: string
}

/** 「仅今天 / 仅本周期 / 从此以后」三种调整范围 */
export type AdjustScope = 'day' | 'cycle' | 'future'
