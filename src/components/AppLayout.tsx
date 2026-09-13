import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import Icon from './Icon'
import SyncBadge from './SyncBadge'
import Sheet from './Sheet'
import { useAppStore } from '../store/useAppStore'

interface NavItem {
  to: string
  label: string
  icon: string
  /** 是否出现在移动端底部导航 */
  bottom: boolean
}

const NAV: NavItem[] = [
  {
    to: '',
    label: '值日',
    icon: 'M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z',
    bottom: true,
  },
  {
    to: 'calendar',
    label: '日历',
    icon: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
    bottom: true,
  },
  {
    to: 'members',
    label: '成员',
    icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    bottom: true,
  },
  {
    to: 'items',
    label: '内容',
    icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
    bottom: true,
  },
  {
    to: 'settings',
    label: '设置',
    icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.06-.4.1-.8.1-1.2Z',
    bottom: true,
  },
  { to: 'stats', label: '统计', icon: 'M3 3v18h18M7 15l3-4 3 3 5-7', bottom: false },
  { to: 'history', label: '历史', icon: 'M12 8v4l3 2M3.05 11a9 9 0 1 1 .5 4M3 4v4h4', bottom: false },
]

export default function AppLayout() {
  const { roomId = '' } = useParams()
  const navigate = useNavigate()
  const data = useAppStore((s) => s.data)
  const leaveRoom = useAppStore((s) => s.leaveRoom)
  const [infoOpen, setInfoOpen] = useState(false)

  const base = `/room/${roomId}`
  const bottomItems = NAV.filter((n) => n.bottom)

  function backToList() {
    leaveRoom()
    navigate('/')
  }

  if (!data) return null

  return (
    <div className="min-h-full md:flex md:h-screen md:overflow-hidden">
      {/* ================= 桌面端：固定左侧边栏 ================= */}
      <aside className="hidden md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col md:border-r md:border-slate-200/70 md:bg-white/70 md:backdrop-blur-xl">
        <div className="px-5 pb-4 pt-6">
          <button
            type="button"
            className="mb-4 inline-flex items-center gap-1 text-xs text-slate-400 transition hover:text-blue-600"
            onClick={backToList}
          >
            <Icon path="M15 18l-6-6 6-6" size={14} />
            房间列表
          </button>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-semibold text-white shadow-[0_6px_16px_-6px_rgba(59,130,246,0.9)]">
              值
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold tracking-tight text-slate-900">
                {data.room.roomNumber}
              </div>
              <div className="truncate text-[11px] text-slate-400">
                {data.room.apartment} · {data.room.building}
              </div>
            </div>
          </div>
          <div className="mt-3">
            <SyncBadge />
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to || 'index'}
              to={item.to ? `${base}/${item.to}` : base}
              end={!item.to}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
                  isActive
                    ? 'bg-blue-50 font-medium text-blue-700'
                    : 'text-slate-500 hover:bg-slate-100/70 hover:text-slate-700',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon path={item.icon} size={18} />
                  {item.label}
                  {isActive ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-500" /> : null}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200/70 px-5 py-4 text-[11px] leading-relaxed text-slate-400">
          周期内每天安排相同
          <br />
          下一周期自动轮换
        </div>
      </aside>

      {/* ================= 主区域：桌面端在自己这一列里独立滚动 ================= */}
      <div className="flex min-h-full w-full flex-col md:h-screen md:min-h-0 md:overflow-y-auto">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200/70 bg-white/80 px-3 py-2.5 backdrop-blur-xl md:hidden">
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-600 transition active:bg-slate-100"
            onClick={backToList}
            aria-label="返回房间列表"
          >
            <Icon path="M15 18l-6-6 6-6" size={20} />
          </button>
          <button type="button" className="min-w-0 flex-1 text-center" onClick={() => setInfoOpen(true)}>
            <div className="truncate text-[13px] font-semibold tracking-tight text-slate-900">
              {data.room.name}
            </div>
            <div className="mt-0.5 flex justify-center">
              <SyncBadge />
            </div>
          </button>
          <span className="w-7" />
        </header>

        {/* 移动端左右各 16px，桌面端收紧到 24px 并把内容上限放宽，
            避免大屏两侧留出过宽的空档 */}
        <main className="flex-1 px-4 py-5 pb-28 md:px-6 md:py-7 md:pb-12 lg:px-8">
          {/* md:h-full 让页面能把「可用高度」继续往下传，
              日历页靠它把整块日历撑满一屏、不用滚动 */}
          <div className="mx-auto w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl md:h-full">
            <Outlet />
          </div>
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 bg-white/85 shadow-[0_-2px_12px_-6px_rgba(16,24,40,0.18)] backdrop-blur-xl md:hidden">
          <div className="flex px-1 pb-[env(safe-area-inset-bottom)]">
            {bottomItems.map((item) => (
              <NavLink
                key={item.to || 'index'}
                to={item.to ? `${base}/${item.to}` : base}
                end={!item.to}
                className="flex flex-1 flex-col items-center gap-0.5 pb-2 pt-1.5 text-[11px] transition"
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={[
                        'flex h-7 w-11 items-center justify-center rounded-[10px] transition duration-200',
                        isActive ? 'bg-blue-50 text-blue-600' : 'text-slate-400',
                      ].join(' ')}
                    >
                      <Icon path={item.icon} size={20} />
                    </span>
                    <span className={isActive ? 'font-medium text-blue-600' : 'text-slate-400'}>
                      {item.label}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>

      <Sheet open={infoOpen} title="当前房间" onClose={() => setInfoOpen(false)}>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">公寓</dt>
            <dd className="font-medium">{data.room.apartment}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">楼栋</dt>
            <dd className="font-medium">{data.room.building}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">房间号</dt>
            <dd className="font-medium">{data.room.roomNumber}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">同步状态</dt>
            <dd>
              <SyncBadge />
            </dd>
          </div>
        </dl>
      </Sheet>
    </div>
  )
}
