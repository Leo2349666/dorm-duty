/** 公寓 → 楼栋 的固定层级数据 */
export interface ApartmentOption {
  name: string
  /** 显示用简称，用于拼「鹿田南苑1南」这种完整楼栋名 */
  short: string
  buildings: string[]
}

function range(start: number, end: number, suffix = '号楼'): string[] {
  const out: string[] = []
  for (let i = start; i <= end; i += 1) out.push(`${i}${suffix}`)
  return out
}

export const APARTMENTS: ApartmentOption[] = [
  { name: '学士苑', short: '学士苑', buildings: range(1, 10) },
  { name: '桃李公寓', short: '桃李', buildings: range(4, 8) },
  {
    name: '鹿田公寓',
    short: '鹿田',
    buildings: ['南苑1北', '南苑1南', '南苑2北', '南苑2南', '南苑3'],
  },
  {
    name: '龙南公寓',
    short: '龙南',
    buildings: [
      '龙川南苑1北',
      '龙川南苑1南',
      '龙川南苑2北',
      '龙川南苑2南',
      '龙川南苑3北',
      '龙川南苑3南',
      '龙川南苑4北',
      '龙川南苑4南',
    ],
  },
  {
    name: '龙北公寓',
    short: '龙北',
    buildings: [
      '龙川北苑1北',
      '龙川北苑1南',
      '龙川北苑2北',
      '龙川北苑2南',
      '龙川北苑3北',
      '龙川北苑3南',
      '龙川北苑4北',
      '龙川北苑4南',
    ],
  },
]

export function buildingsOf(apartment: string): string[] {
  return APARTMENTS.find((a) => a.name === apartment)?.buildings ?? []
}

/**
 * 楼栋下拉里显示的完整名称，例如「学士苑1号楼」「桃李4号楼」「鹿田南苑1南」。
 * 注意：这只是**显示文案**，数据库里存的仍然是「1号楼」这种短名称，
 * 所以改了显示不会影响已经建好的房间。
 */
export function buildingLabel(apartment: string, building: string): string {
  const option = APARTMENTS.find((a) => a.name === apartment)
  return option ? `${option.short}${building}` : building
}

/**
 * 公寓下拉里显示的文案，带上可选楼栋范围，例如「学士苑（1-10号楼）」。
 * 楼栋号是纯数字时就压成「1-10号楼」，否则用「首 ~ 尾」表示。
 */
export function apartmentLabel(apartment: string): string {
  const option = APARTMENTS.find((a) => a.name === apartment)
  if (!option || option.buildings.length === 0) return apartment
  const list = option.buildings
  const first = list[0]
  const last = list[list.length - 1]
  const numeric = /^(\d+)号楼$/.exec(first) && /^(\d+)号楼$/.exec(last)
  const span = numeric ? `${/^(\d+)/.exec(first)![1]}-${/^(\d+)/.exec(last)![1]}号楼` : `${first} ~ ${last}`
  return `${option.name}（${span}）`
}

/** 默认值日内容，顺序即排班顺序 */
export const DEFAULT_DUTY_ITEMS = ['阳台', '地面', '倒垃圾', '洗手台', '浴室']

/** 默认成员人数 */
export const DEFAULT_MEMBER_COUNT = 5

/** 默认成员名（用户可随时改名） */
export const DEFAULT_MEMBER_NAMES = ['成员1', '成员2', '成员3', '成员4', '成员5']

/** 默认排班周期：一周 */
export const DEFAULT_PERIOD_DAYS = 7

/**
 * 值日内容的调色板。
 * 新建值日项时按顺序自动取色，保证「靠颜色辨认」的体验稳定。
 * 每个颜色都给了 bg（浅底）和 fg（深字），保证浅色主题下的对比度。
 */
export const COLOR_PALETTE = [
  { name: '橙', hex: '#f59e0b' },
  { name: '蓝', hex: '#3b82f6' },
  { name: '绿', hex: '#10b981' },
  { name: '紫', hex: '#8b5cf6' },
  { name: '青', hex: '#06b6d4' },
  { name: '玫红', hex: '#ec4899' },
  { name: '靛蓝', hex: '#6366f1' },
  { name: '红', hex: '#ef4444' },
  { name: '黄绿', hex: '#84cc16' },
  { name: '棕', hex: '#a16207' },
]

export function pickColor(index: number): string {
  return COLOR_PALETTE[((index % COLOR_PALETTE.length) + COLOR_PALETTE.length) % COLOR_PALETTE.length].hex
}

/**
 * 把 hex 颜色转成带透明度的 rgba，用于浅色底标签。
 * 这样不用为每个颜色单独写一套 Tailwind 类。
 */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const r = parseInt(full.slice(0, 2), 16) || 0
  const g = parseInt(full.slice(2, 4), 16) || 0
  const b = parseInt(full.slice(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** 本机存储用的 key，统一带前缀，避免和其它项目打架 */
export const STORAGE_KEYS = {
  rooms: 'dorm-duty:rooms',
  identity: 'dorm-duty:identity',
  db: 'dorm-duty:local-db',
  pending: 'dorm-duty:pending-ops',
} as const
