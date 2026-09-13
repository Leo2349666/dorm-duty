import type { ChangeLog, DayPlan, DutyItem, Member, Room, RoomData } from '../types'

/**
 * 同步状态：
 *  - local   ：当前是纯本地模式（没有配置 Supabase）
 *  - synced  ：已连上云端，数据都是最新的
 *  - syncing ：正在往云端写 / 正在拉取
 *  - offline ：云端写失败了，改动暂存在本机队列里，联网后会自动补传
 */
export type SyncStatus = 'local' | 'synced' | 'syncing' | 'offline'

/**
 * 数据适配器接口。
 *
 * 整个应用只认这个接口，不关心背后是 localStorage 还是 Supabase。
 * 想从「纯本地」升级成「云端同步」，唯一需要做的就是填上 .env 里的两个变量，
 * 一行业务代码都不用改。
 */
export interface DataAdapter {
  /** 当前模式 */
  readonly mode: 'local' | 'supabase'
  /** 当前同步状态 */
  readonly status: SyncStatus

  /** 初始化（本地模式什么都不做；云端模式会做匿名登录） */
  init(): Promise<void>
  /** 订阅同步状态变化，返回取消订阅函数 */
  onStatus(cb: (status: SyncStatus) => void): () => void

  // ---- 房间 ----
  /** 按「公寓 + 楼栋 + 房间号」查找房间，找不到返回 null */
  findRoom(apartment: string, building: string, roomNumber: string): Promise<Room | null>
  /** 创建房间，同时写入默认成员和默认值日内容 */
  createRoom(room: Room, members: Member[], items: DutyItem[]): Promise<void>
  getRoom(roomId: string): Promise<Room | null>
  updateRoom(roomId: string, patch: Partial<Room>): Promise<void>

  // ---- 房间内的全部数据 ----
  loadRoom(roomId: string): Promise<RoomData | null>

  // ---- 成员 / 值日内容 ----
  saveMembers(rows: Member[]): Promise<void>
  saveItems(rows: DutyItem[]): Promise<void>

  // ---- 排班 ----
  /**
   * 覆盖式写入排班：先删掉这些日期上已有的排班，再写入新的。
   * 自动排班、局部重排、手动调整都走这一个入口。
   */
  savePlans(roomId: string, plans: DayPlan[]): Promise<void>
  /** 删除 fromDate（含）之后的所有排班 */
  clearPlansFrom(roomId: string, fromDate: string): Promise<void>

  // ---- 历史记录 ----
  addLog(log: ChangeLog): Promise<void>

  // ---- 实时订阅（本地模式下是空实现） ----
  /** 订阅某个房间的数据变化，返回取消订阅函数 */
  subscribe(roomId: string, cb: () => void): () => void
}
