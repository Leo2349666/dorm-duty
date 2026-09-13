import { useEffect, useMemo, useState } from 'react'
import { HashRouter, Link, Navigate, Route, Routes, useParams } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import ConfirmHost from './components/ConfirmHost'
import Toaster from './components/Toaster'
import { useAppStore } from './store/useAppStore'
import AddRoomPage from './pages/AddRoomPage'
import CalendarPage from './pages/CalendarPage'
import DutyPage from './pages/DutyPage'
import HistoryPage from './pages/HistoryPage'
import ItemsPage from './pages/ItemsPage'
import MembersPage from './pages/MembersPage'
import RoomListPage from './pages/RoomListPage'
import SettingsPage from './pages/SettingsPage'
import StatsPage from './pages/StatsPage'

/** 只初始化一次（开发模式 StrictMode 下 effect 会跑两遍） */
let bootstrapped = false

/** 负责把房间数据加载好，再交给 AppLayout 渲染 */
function RoomGuard() {
  const { roomId = '' } = useParams()
  const data = useAppStore((s) => s.data)
  const enterRoom = useAppStore((s) => s.enterRoom)
  const leaveRoom = useAppStore((s) => s.leaveRoom)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    if (useAppStore.getState().data?.room.id === roomId) {
      setFailed(false)
      return
    }
    leaveRoom()
    setFailed(false)
    void enterRoom(roomId).then(() => {
      if (!alive) return
      // 加载完还是没有数据，说明这个房间在服务器上不存在
      if (useAppStore.getState().data?.room.id !== roomId) setFailed(true)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  if (failed) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-base font-medium text-slate-800">找不到这个房间</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            这个房间可能已经被删除，或者当前设备没有访问权限。
            <br />
            回到房间列表后可以重新添加。
          </p>
          <Link to="/" className="btn-primary mt-5 w-full">
            返回房间列表
          </Link>
        </div>
      </div>
    )
  }

  if (!data || data.room.id !== roomId) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center text-sm text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500" />
          正在打开房间…
        </div>
      </div>
    )
  }

  return <AppLayout />
}

export default function App() {
  const init = useAppStore((s) => s.init)
  const ready = useAppStore((s) => s.ready)

  useEffect(() => {
    const task = bootstrapped ? Promise.resolve() : init()
    bootstrapped = true
    void task.catch((err) => console.error('[dorm-duty] 初始化失败', err))
  }, [init])

  // 等初始化真正完成后再移除 index.html 里的首屏骨架，
  // 避免骨架先消失、React 又还没渲染，中间闪过一下白屏
  useEffect(() => {
    if (ready) document.getElementById('boot')?.remove()
  }, [ready])

  const routes = useMemo(
    () => (
      <Routes>
        <Route path="/" element={<RoomListPage />} />
        <Route path="/add" element={<AddRoomPage />} />
        {/* 嵌套路由：RoomGuard 负责数据，AppLayout 负责外壳，Outlet 渲染具体页面 */}
        <Route path="/room/:roomId" element={<RoomGuard />}>
          <Route index element={<DutyPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="members" element={<MembersPage />} />
          <Route path="items" element={<ItemsPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    ),
    [],
  )

  if (!ready) return null

  return (
    <HashRouter>
      <Toaster />
      <ConfirmHost />
      {routes}
    </HashRouter>
  )
}
