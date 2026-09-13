import { STORAGE_KEYS } from './constants'
import type { LocalRoomRef } from '../types'

/** 房间在本地的唯一键：公寓|楼栋|房间号 */
export function roomKey(apartment: string, building: string, roomNumber: string): string {
  return `${apartment}|${building}|${roomNumber}`
}

/** 读取本机保存的房间列表，按最后打开时间倒序 */
export function readLocalRooms(): LocalRoomRef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.rooms)
    if (!raw) return []
    const list = JSON.parse(raw) as LocalRoomRef[]
    if (!Array.isArray(list)) return []
    return list.slice().sort((a, b) => (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? ''))
  } catch {
    return []
  }
}

export function writeLocalRooms(list: LocalRoomRef[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.rooms, JSON.stringify(list))
  } catch {
    /* 忽略 */
  }
}

/** 加入（或更新）一条房间记录 */
export function upsertLocalRoom(ref: LocalRoomRef): LocalRoomRef[] {
  const list = readLocalRooms().filter((r) => r.key !== ref.key)
  list.unshift(ref)
  writeLocalRooms(list)
  return list
}

/** 只删本机的记录，服务器数据完全不动 */
export function removeLocalRoom(key: string): LocalRoomRef[] {
  const list = readLocalRooms().filter((r) => r.key !== key)
  writeLocalRooms(list)
  return list
}

/** 「我是谁」：每台设备、每个房间各存一份，不上传服务器 */
export function readIdentities(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.identity)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export function writeIdentity(roomId: string, memberId: string | null): Record<string, string> {
  const map = readIdentities()
  if (memberId) map[roomId] = memberId
  else delete map[roomId]
  try {
    localStorage.setItem(STORAGE_KEYS.identity, JSON.stringify(map))
  } catch {
    /* 忽略 */
  }
  return map
}
