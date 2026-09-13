import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ExportActions from '../components/ExportActions'
import SyncBadge from '../components/SyncBadge'
import { formatYMD, todayStr } from '../lib/date'
import { activeMembers } from '../lib/schedule'
import { roomKey } from '../lib/storage'
import { confirm } from '../store/useConfirm'
import { toast } from '../store/useToast'
import { useAppStore, useMyMember, type ImportPayload } from '../store/useAppStore'

export default function SettingsPage() {
  const data = useAppStore((s) => s.data)
  const cloudMode = useAppStore((s) => s.cloudMode)
  const busy = useAppStore((s) => s.busy)
  const updateRoomSettings = useAppStore((s) => s.updateRoomSettings)
  const generateAll = useAppStore((s) => s.generateAll)
  const setIdentity = useAppStore((s) => s.setIdentity)
  const removeLocalRoom = useAppStore((s) => s.removeLocalRoom)
  const leaveRoom = useAppStore((s) => s.leaveRoom)
  const importRoom = useAppStore((s) => s.importRoom)
  const reload = useAppStore((s) => s.reload)
  const refreshRooms = useAppStore((s) => s.refreshRooms)
  const myMember = useMyMember()
  const navigate = useNavigate()

  const [periodDays, setPeriodDays] = useState(() => data?.room.periodDays ?? 7)
  const [startDate, setStartDate] = useState(() => data?.room.startDate ?? todayStr())
  const [endDate, setEndDate] = useState(() => data?.room.endDate ?? todayStr())
  const fileRef = useRef<HTMLInputElement>(null)

  // 切换房间时把表单同步成新房间的设置
  const roomId = data?.room.id
  useEffect(() => {
    if (!data) return
    setPeriodDays(data.room.periodDays)
    setStartDate(data.room.startDate)
    setEndDate(data.room.endDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  const members = useMemo(() => (data ? activeMembers(data.members) : []), [data])

  if (!data) return null

  const room = data.room

  async function saveScheduleSettings() {
    if (startDate > endDate) {
      toast.error('开始日期不能晚于结束日期')
      return
    }
    if (!Number.isFinite(periodDays) || periodDays < 1 || periodDays > 365) {
      toast.error('周期天数需要在 1 ~ 365 之间')
      return
    }
    const structural = periodDays !== room.periodDays || startDate !== room.startDate
    if (structural && data!.days.length > 0) {
      const ok = await confirm({
        title: '修改周期设置？',
        message:
          '周期长度或开始日期发生变化后，周期的划分方式就完全不同了。\n\n已经生成的排班和手动调整会全部清空，需要重新生成一次。确定继续吗？',
        confirmText: '继续修改',
        tone: 'danger',
      })
      if (!ok) return
    }
    await updateRoomSettings({ periodDays, startDate, endDate })
    toast.success('设置已保存')
  }

  async function handleGenerate() {
    try {
      await generateAll()
      toast.success('排班已重新生成')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成失败')
    }
  }

  function handleImportClick() {
    fileRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      void doImport(String(reader.result ?? ''))
    }
    reader.onerror = () => toast.error('读取文件失败')
    reader.readAsText(file, 'utf-8')
  }

  async function doImport(text: string) {
    let payload: ImportPayload
    try {
      const parsed = JSON.parse(text) as Partial<ImportPayload>
      if (!parsed.room || !Array.isArray(parsed.members) || !Array.isArray(parsed.dutyItems)) {
        throw new Error('文件格式不对')
      }
      payload = {
        room: parsed.room,
        members: parsed.members,
        dutyItems: parsed.dutyItems,
        days: Array.isArray(parsed.days) ? parsed.days : [],
      }
    } catch {
      toast.error('这不是有效的排班导出文件')
      return
    }

    const ok = await confirm({
      title: '导入这份数据？',
      message: `文件来自「${payload.room.name}」。\n\n同名房间（公寓 + 楼栋 + 房间号相同）的成员、值日内容和排班会以这份文件为准进行覆盖。`,
      confirmText: '导入',
    })
    if (!ok) return

    await importRoom(payload)
    refreshRooms()
    if (payload.room.id === room.id) await reload()
    toast.success('导入完成')
  }

  async function handleRemoveLocal() {
    const ok = await confirm({
      title: '删除本地房间记录？',
      message:
        '只会从这台设备的房间列表里移除，服务器上的数据完全不受影响。\n\n之后重新输入相同的公寓、楼栋、房间号还能进来。',
      confirmText: '删除记录',
      tone: 'danger',
    })
    if (!ok) return
    removeLocalRoom(roomKey(room.apartment, room.building, room.roomNumber))
    leaveRoom()
    navigate('/')
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold tracking-tight text-slate-900">设置</h1>

      {/* ---- 房间信息 ---- */}
      <section className="card">
        <h2 className="card-title mb-3">当前房间</h2>
        <dl className="space-y-2.5 text-sm">
          <Row label="公寓" value={room.apartment} />
          <Row label="楼栋" value={room.building} />
          <Row label="房间号" value={room.roomNumber} />
          <Row label="创建时间" value={formatYMD(room.createdAt)} />
        </dl>
      </section>

      {/* ---- 排班周期 ---- */}
      <section className="card space-y-4">
        <div>
          <h2 className="card-title">排班周期</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            周期内每天的值日安排完全相同，下一个周期才轮换人员。默认 7 天（一周）。
          </p>
        </div>

        <div>
          <label className="label" htmlFor="period">
            周期天数
          </label>
          <div className="flex items-center gap-2">
            <input
              id="period"
              type="number"
              min={1}
              max={365}
              className="field flex-1"
              value={periodDays}
              onChange={(e) => setPeriodDays(Number(e.target.value))}
            />
            <span className="shrink-0 text-sm text-slate-400">天</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {[1, 3, 5, 7, 14, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setPeriodDays(d)}
                className={[
                  'rounded-full px-3 py-1.5 text-xs transition',
                  periodDays === d ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500',
                ].join(' ')}
              >
                {d === 1 ? '每天' : d === 7 ? '一周' : `${d} 天`}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="start">
              开始日期
            </label>
            <input
              id="start"
              type="date"
              className="field"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="end">
              结束日期
            </label>
            <input
              id="end"
              type="date"
              className="field"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        {startDate > endDate ? (
          <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-xs text-rose-600">
            开始日期不能晚于结束日期，请调整后再保存。
          </p>
        ) : null}

        <div className="flex gap-3">
          <button type="button" className="btn-ghost flex-1" onClick={saveScheduleSettings} disabled={busy}>
            保存设置
          </button>
          <button type="button" className="btn-primary flex-1" onClick={handleGenerate} disabled={busy}>
            {data.days.length ? '重新生成排班' : '一键自动排班'}
          </button>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-400">
          重新生成会按当前成员和值日内容重排整个 {startDate} ~ {endDate} 区间，
          此前的排班会被覆盖（历史记录里仍可查到旧的操作）。
        </p>
      </section>

      {/* ---- 我的身份 ---- */}
      <section className="card">
        <h2 className="card-title">我是谁</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          选一次自己的名字，首页和日历里就会把你负责的那一行高亮出来。这只保存在本机，不会上传。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setIdentity(myMember?.id === m.id ? null : m.id)}
              className={[
                'rounded-full px-3.5 py-2 text-sm transition',
                myMember?.id === m.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600',
              ].join(' ')}
            >
              {m.name}
            </button>
          ))}
          {members.length === 0 ? <span className="text-sm text-slate-400">还没有成员</span> : null}
        </div>
        {myMember ? (
          <button type="button" className="mt-3 text-xs text-slate-400" onClick={() => setIdentity(null)}>
            取消身份设置
          </button>
        ) : null}
      </section>

      {/* ---- 数据同步 ---- */}
      <section className="card">
        <h2 className="card-title mb-2">数据同步</h2>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          当前状态：<SyncBadge />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          {cloudMode ? (
            <>
              已连接云端。室友在各自设备上输入相同的「{room.apartment} + {room.building} + {room.roomNumber}」，
              成员、值日内容、排班和调整都会实时同步。
              <br />
              如果显示「离线」，说明网络暂时不通，改动会先存在本机，联网后自动补传，不会丢。
            </>
          ) : (
            <>
              当前没有配置云端，数据只保存在这台设备的浏览器里。
              <br />
              换设备、清缓存会看不到数据，需要用下面的「导出 / 导入」搬家。
              想开启多设备实时同步，请参考项目 README 的 Supabase 配置说明。
            </>
          )}
        </p>
      </section>

      {/* ---- 导出（和首页共用同一套组件） ---- */}
      <section className="card">
        <h2 className="card-title mb-3">导出</h2>
        <ExportActions />
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="card-title">导入</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            选择之前导出的 JSON 文件，把这份排班恢复到本设备。
          </p>
        </div>
        <button type="button" className="btn-ghost w-full" onClick={handleImportClick}>
          选择 JSON 文件
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleFileChange}
        />
      </section>

      {/* ---- 快捷入口 ---- */}
      <section className="card space-y-2">
        <Link className="flex items-center justify-between py-1 text-sm text-slate-700" to={`/room/${room.id}/history`}>
          历史记录
          <span className="text-slate-300">›</span>
        </Link>
        <Link className="flex items-center justify-between py-1 text-sm text-slate-700" to={`/room/${room.id}/stats`}>
          统计与公平度
          <span className="text-slate-300">›</span>
        </Link>
      </section>

      {/* ---- 危险操作 ---- */}
      <section className="card">
        <h2 className="text-[13px] font-semibold tracking-tight text-rose-600">删除本地记录</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          只删除这台设备上的房间记录。服务器上的数据不受影响，重新输入相同的公寓、楼栋、房间号还能进来。
        </p>
        <button type="button" className="btn-danger mt-3 w-full" onClick={handleRemoveLocal}>
          删除本地房间记录
        </button>
      </section>

      <p className="pb-4 text-center text-[11px] text-slate-300">寝室值日排班系统</p>

    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="truncate font-medium text-slate-800">{value}</dd>
    </div>
  )
}
