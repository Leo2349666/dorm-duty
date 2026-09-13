import { Link, useNavigate } from 'react-router-dom'
import SyncBadge from '../components/SyncBadge'
import { confirm } from '../store/useConfirm'
import { toast } from '../store/useToast'
import { useAppStore } from '../store/useAppStore'
import { formatDateTime } from '../lib/date'

/** 房间选择/添加页：本机保存过的房间都在这里，点一下直接进 */
export default function RoomListPage() {
  const rooms = useAppStore((s) => s.rooms)
  const cloudMode = useAppStore((s) => s.cloudMode)
  const removeLocalRoom = useAppStore((s) => s.removeLocalRoom)
  const enterRoom = useAppStore((s) => s.enterRoom)
  const navigate = useNavigate()

  async function handleEnter(id: string) {
    await enterRoom(id)
    navigate(`/room/${id}`)
  }

  async function handleRemove(key: string, name: string) {
    const ok = await confirm({
      title: '删除这条本地记录？',
      message: `只会从这台设备的列表里移除「${name}」。\n服务器上的数据（成员、排班、历史）完全不受影响，之后重新输入同样的公寓、楼栋、房间号还能进来。`,
      confirmText: '删除记录',
      tone: 'danger',
    })
    if (!ok) return
    removeLocalRoom(key)
    toast.success('已删除本地记录')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-semibold text-white shadow-[0_10px_24px_-10px_rgba(59,130,246,0.95)]">
              值
            </span>
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">寝室值日排班</h1>
              <div className="mt-1">
                <SyncBadge />
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-500">
            打开链接就能用，不用登录、不用注册。按周期轮换，周期内每天安排相同。
          </p>
        </header>

        <div
          className={[
            'mb-5 rounded-2xl px-4 py-3 text-xs leading-relaxed',
            cloudMode ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
          ].join(' ')}
        >
          {cloudMode ? (
            <>云端同步已开启。多台设备输入相同的「公寓 + 楼栋 + 房间号」即可实时看到同一份排班。</>
          ) : (
            <>
              当前是<b>纯本地模式</b>：数据只保存在这台设备的浏览器里。
              <br />
              换设备、清缓存会看不到数据，需要用「设置 → 导出 / 导入」手动搬家。
              想开启多设备实时同步，请看项目 README 的 Supabase 配置说明。
            </>
          )}
        </div>

        <button type="button" className="btn-primary w-full py-3.5" onClick={() => navigate('/add')}>
          + 添加房间
        </button>

        <section className="mt-6">
          <h2 className="mb-3 text-sm font-medium text-slate-500">我的房间</h2>

          {rooms.length === 0 ? (
            <div className="card flex flex-col items-center px-6 py-9 text-center">
              <span className="empty-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
                  <path d="M3 10.5 12 3l9 7.5M5.5 9.5V21h13V9.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <p className="mt-3.5 text-sm font-medium text-slate-700">还没有添加过房间</p>
              <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-slate-400">
                点上面的「添加房间」，选择公寓、楼栋并填写房间号就能开始。
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {rooms.map((room) => (
                <li key={room.key} className="card flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-200/70 text-[13px] font-semibold text-slate-500">
                    {room.roomNumber.slice(0, 3)}
                  </span>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => handleEnter(room.id)}>
                    <div className="truncate text-[15px] font-semibold tracking-tight text-slate-900">{room.name}</div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      上次打开 {room.lastOpenedAt ? formatDateTime(room.lastOpenedAt) : '—'}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="shrink-0 rounded-xl px-2.5 py-2 text-xs text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                    onClick={() => handleRemove(room.key, room.name)}
                  >
                    删除
                  </button>
                  <button
                    type="button"
                    className="shrink-0 rounded-xl bg-blue-50 px-3.5 py-2 text-[13px] font-medium text-blue-600 transition hover:bg-blue-100 active:scale-95"
                    onClick={() => handleEnter(room.id)}
                  >
                    进入
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-10 text-center text-xs leading-relaxed text-slate-400">
          一个房间由「公寓 + 楼栋 + 房间号」唯一确定。
          <br />
          同一宿舍的人在各自手机上输入同样的三项，就能看到同一份排班。
          <br />
          <Link to="/add" className="text-blue-500">
            添加新房间
          </Link>
        </footer>
      </div>
    </div>
  )
}
