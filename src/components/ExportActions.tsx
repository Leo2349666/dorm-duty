import { useMemo, useRef, useState } from 'react'
import Modal from './Modal'
import { copyText } from '../lib/clipboard'
import { cycleRange, daysBetween, formatMD, todayStr, weekdayCN } from '../lib/date'
import { downloadDataUrl, exportCsv, exportJson, jsonText, renderToImage } from '../lib/exporters'
import { lastCycleIndex, liveItems } from '../lib/schedule'
import { toast } from '../store/useToast'
import { useAppStore } from '../store/useAppStore'

/**
 * 导出操作区，首页和设置页共用。
 *
 * ============================================================================
 * 关于导出的图片为什么长这样（重要，别随手改）
 * ============================================================================
 *
 * 下面这块卡片是用 html2canvas 截图生成图片的，而 html2canvas 在画文字时
 * 会有一个固定的基线偏移：文字会比它所在的盒子中心**低几个像素**。
 * 这个偏移跟写法、字体都无关（换成 height + line-height、换成别的字体，
 * 实测偏差都一样），是库自身的行为。
 *
 * 后果是：只要用"图形"（色块、圆角矩形、色条）去配"文字"，导出图里
 * 文字就会显得贴着色块底边、和色条对不齐 —— 这正是之前"标签与颜色错位"
 * 的原因。
 *
 * 所以这块卡片采用**纯文字驱动**的排版：
 *   · 颜色只用「彩色圆点字形 ●」和「彩色人名文字」来表达，不用任何色块背景
 *   · 圆点也是文字，和旁边的人名、值日项走同一套文字渲染，天然对齐
 *   · 行与行之间只用 1px 虚线分隔（横线的位置和文字没有对齐关系）
 *
 * 实测结果：同一行内三个文字元素的中心偏差在 0~1px 以内。
 *
 * 反过来说，**不要**把这里的圆点换成 <div> 色块、也不要把人名套回带背景色的
 * 圆角标签里 —— 那样"错位"会立刻回来。
 */
export default function ExportActions() {
  const data = useAppStore((s) => s.data)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  const items = useMemo(() => (data ? liveItems(data.dutyItems) : []), [data])

  if (!data) return null

  const room = data.room
  const lastCycle = Math.max(0, lastCycleIndex(room.startDate, room.endDate, room.periodDays))
  const rawCycle = Math.floor(daysBetween(room.startDate, todayStr()) / room.periodDays)
  const cycleIndex = Math.min(Math.max(0, rawCycle), lastCycle)
  const cycle = cycleRange(room.startDate, room.periodDays, cycleIndex)
  const plan = data.days.find((d) => d.cycleIndex === cycleIndex) ?? data.days[0]
  const memberName = (id: string) => data.members.find((m) => m.id === id)?.name ?? '已删除成员'

  const subtitle =
    room.periodDays === 1
      ? `${formatMD(cycle.start)} ${weekdayCN(cycle.start)}`
      : room.periodDays === 7
        ? `第 ${cycleIndex + 1} 周 · ${formatMD(cycle.start)} – ${formatMD(cycle.end)}`
        : `第 ${cycleIndex + 1} 轮（${room.periodDays} 天）· ${formatMD(cycle.start)} – ${formatMD(cycle.end)}`

  async function handleImage() {
    if (!exportRef.current) return
    setRendering(true)
    try {
      const url = await renderToImage(exportRef.current)
      setImageUrl(url)
    } catch (err) {
      console.error(err)
      toast.error('生成图片失败，可以改用导出 CSV')
    } finally {
      setRendering(false)
    }
  }

  async function handleCopyJson() {
    const ok = await copyText(jsonText(data!))
    if (ok) toast.success('JSON 已复制到剪贴板')
    else toast.error('复制失败，可以改用「导出 JSON」')
  }

  // 虚线分隔：第一行不加，其余行加在顶部
  const sep = (index: number) => (index === 0 ? {} : { borderTop: '1px dashed #e2e8f0' })

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            exportJson(data!)
            toast.success('已导出 JSON')
          }}
        >
          导出 JSON
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            exportCsv(room, data!.members, data!.dutyItems, data!.days)
            toast.success('已导出 CSV')
          }}
        >
          导出 CSV
        </button>
        <button type="button" className="btn-ghost" onClick={handleImage} disabled={rendering}>
          {rendering ? '生成中…' : '导出图片'}
        </button>
        <button type="button" className="btn-ghost" onClick={handleCopyJson}>
          复制 JSON
        </button>
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-slate-400">
        JSON 用于备份或换设备；CSV 可用 Excel / WPS 打开；图片可以直接发到寝室群。
        微信里如果点下载没反应，长按弹出的图片即可保存到相册。
      </p>

      {/* ---------------- 离屏渲染的排班卡片（排版方式见文件顶部说明） ---------------- */}
      <div className="pointer-events-none fixed -left-[9999px] top-0" aria-hidden="true">
        <div
          ref={exportRef}
          style={{
            width: 460,
            padding: 28,
            backgroundColor: '#ffffff',
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
          }}
        >
          <div style={{ borderBottom: '1px dashed #e2e8f0', paddingBottom: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', lineHeight: 1.3 }}>
              {room.name}
            </div>
            <div style={{ marginTop: 6, fontSize: 14, color: '#64748b', lineHeight: 1.4 }}>
              {subtitle}
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {plan
                ? items.map((item, index) => {
                    const owners = plan.slots
                      .filter((s) => s.dutyItemId === item.id)
                      .map((s) => memberName(s.memberId))
                    if (owners.length === 0) return null
                    return (
                      <tr key={item.id}>
                        <td
                          style={{
                            padding: '10px 0',
                            fontSize: 15,
                            color: '#334155',
                            ...sep(index),
                          }}
                        >
                          <span style={{ color: item.color }}>{'\u25CF'}</span>
                          {'\u00A0\u00A0'}
                          {item.name}
                        </td>
                        <td
                          style={{
                            padding: '10px 0',
                            textAlign: 'right',
                            fontSize: 15,
                            fontWeight: 600,
                            color: item.color,
                            ...sep(index),
                          }}
                        >
                          {owners.join('、')}
                        </td>
                      </tr>
                    )
                  })
                : null}
            </tbody>
          </table>

          <div
            style={{
              marginTop: 16,
              borderTop: '1px dashed #e2e8f0',
              paddingTop: 12,
              fontSize: 12,
              color: '#94a3b8',
            }}
          >
            周期内每天安排相同 · 周期结束自动轮换 · 寝室值日排班系统
          </div>
        </div>
      </div>

      <Modal
        open={imageUrl !== null}
        title="排班长图"
        onClose={() => setImageUrl(null)}
        maxHeight="60vh"
        footer={
          <div className="flex gap-3">
            <button type="button" className="btn-ghost flex-1" onClick={() => setImageUrl(null)}>
              关闭
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={() => imageUrl && downloadDataUrl(imageUrl, `值日排班-${room.name}.png`)}
            >
              下载图片
            </button>
          </div>
        }
      >
        {imageUrl ? (
          <>
            <img src={imageUrl} alt="排班表" className="w-full rounded-xl ring-1 ring-slate-200" />
            <p className="mt-3 text-center text-xs text-slate-400">
              微信里如果下载没反应，可以长按上面这张图直接保存到相册。
            </p>
          </>
        ) : null}
      </Modal>
    </>
  )
}
