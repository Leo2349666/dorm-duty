import type { DayPlan, DutyItem, Member, Room, RoomData } from '../types'
import { formatMDWeek, weekdayCN } from './date'

/** 触发浏览器下载。微信里可能被拦，所以调用方要准备好兜底提示。 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 1000)
}

export function fileStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/** 导出 JSON（备份 / 换设备搬家） */
export function exportJson(data: RoomData): void {
  const payload = {
    format: 'dorm-duty',
    version: 1,
    exportedAt: new Date().toISOString(),
    room: data.room,
    members: data.members,
    dutyItems: data.dutyItems,
    days: data.days,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  downloadBlob(blob, `值日排班-${data.room.name}-${fileStamp()}.json`)
}

/** JSON 文本（给「复制到剪贴板」用） */
export function jsonText(data: RoomData): string {
  return JSON.stringify(
    {
      format: 'dorm-duty',
      version: 1,
      exportedAt: new Date().toISOString(),
      room: data.room,
      members: data.members,
      dutyItems: data.dutyItems,
      days: data.days,
    },
    null,
    2,
  )
}

/**
 * 生成 CSV 文本。
 * 表头前面加 \ufeff（BOM），否则 Excel / WPS 打开中文会变成乱码 —— 这是个经典坑。
 */
export function scheduleCsv(room: Room, members: Member[], items: DutyItem[], days: DayPlan[]): string {
  const live = items.filter((i) => !i.deletedAt).sort((a, b) => a.orderIndex - b.orderIndex)
  const nameOf = new Map(members.map((m) => [m.id, m.name]))
  const header = ['日期', '星期', '轮次', ...live.map((i) => i.name)]
  const lines: string[] = [header.map(csvCell).join(',')]

  for (const day of days) {
    const cells = [day.date, weekdayCN(day.date), `第 ${day.cycleIndex + 1} 轮`]
    for (const item of live) {
      const names = day.slots
        .filter((s) => s.dutyItemId === item.id)
        .map((s) => nameOf.get(s.memberId) ?? '已删除成员')
      cells.push(names.join('、'))
    }
    lines.push(cells.map(csvCell).join(','))
  }
  return `\ufeff${lines.join('\r\n')}`
}

function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function exportCsv(room: Room, members: Member[], items: DutyItem[], days: DayPlan[]): void {
  const blob = new Blob([scheduleCsv(room, members, items, days)], { type: 'text/csv;charset=utf-8' })
  downloadBlob(blob, `值日排班-${room.name}-${fileStamp()}.csv`)
}

/**
 * 把 DOM 节点渲染成图片 dataURL。
 * html2canvas 动态引入：只有真正点「导出图片」时才下载这个包。
 */
export async function renderToImage(node: HTMLElement): Promise<string> {
  const mod = await import('html2canvas')
  const canvas = await mod.default(node, {
    backgroundColor: '#ffffff',
    scale: Math.min(window.devicePixelRatio || 2, 3),
    useCORS: true,
  })
  return canvas.toDataURL('image/png')
}

/** 下载 dataURL 图片 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => document.body.removeChild(a), 1000)
}

/** 一段排班的人类可读文本，用于分享/复制 */
export function schedulePlainText(
  room: Room,
  members: Member[],
  items: DutyItem[],
  day: DayPlan,
): string {
  const nameOf = new Map(members.map((m) => [m.id, m.name]))
  const lines = [`${room.name}｜${formatMDWeek(day.date)}｜第 ${day.cycleIndex + 1} 轮`]
  for (const item of items.filter((i) => !i.deletedAt).sort((a, b) => a.orderIndex - b.orderIndex)) {
    const names = day.slots
      .filter((s) => s.dutyItemId === item.id)
      .map((s) => nameOf.get(s.memberId) ?? '已删除成员')
    lines.push(`${item.name}：${names.join('、') || '—'}`)
  }
  return lines.join('\n')
}
