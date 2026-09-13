import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { APARTMENTS, apartmentLabel, buildingLabel, buildingsOf } from '../lib/constants'
import { toast } from '../store/useToast'
import { useAppStore } from '../store/useAppStore'

/**
 * 添加房间。
 * 公寓 → 楼栋是联动的（选了公寓之后楼栋下拉才会列出对应楼栋）。
 * 如果这个房间在服务器上已经存在，会直接进入，不会重复创建。
 */
export default function AddRoomPage() {
  const navigate = useNavigate()
  const addRoom = useAppStore((s) => s.addRoom)
  const enterRoom = useAppStore((s) => s.enterRoom)
  const busy = useAppStore((s) => s.busy)
  const cloudMode = useAppStore((s) => s.cloudMode)

  const [apartment, setApartment] = useState('')
  const [building, setBuilding] = useState('')
  const [roomNumber, setRoomNumber] = useState('')

  const buildings = useMemo(() => (apartment ? buildingsOf(apartment) : []), [apartment])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const result = await addRoom(apartment, building, roomNumber)
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    await enterRoom(result.roomId)
    navigate(`/room/${result.roomId}`)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-lg px-4 py-8">
        <button
          type="button"
          className="mb-5 text-sm text-slate-500 transition hover:text-blue-600"
          onClick={() => navigate('/')}
        >
          ← 返回房间列表
        </button>

        <h1 className="text-xl font-semibold tracking-tight text-slate-900">添加房间</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          房间由「公寓 + 楼栋 + 房间号」唯一确定。
          {cloudMode
            ? '室友在各自手机上填一样的三项，就会进入同一个房间。'
            : '当前是纯本地模式，这份数据只存在这台设备上。'}
        </p>

        <form className="card mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="label" htmlFor="apartment">
              公寓
            </label>
            <select
              id="apartment"
              className="field"
              value={apartment}
              onChange={(e) => {
                setApartment(e.target.value)
                setBuilding('') // 换公寓时清空楼栋，避免残留上一个公寓的楼栋
              }}
            >
              <option value="">请选择公寓</option>
              {APARTMENTS.map((a) => (
                <option key={a.name} value={a.name}>
                  {apartmentLabel(a.name)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="building">
              楼栋
            </label>
            <select
              id="building"
              className="field disabled:opacity-50"
              value={building}
              disabled={!apartment}
              onChange={(e) => setBuilding(e.target.value)}
            >
              <option value="">{apartment ? '请选择楼栋' : '请先选择公寓'}</option>
              {buildings.map((b) => (
                <option key={b} value={b}>
                  {buildingLabel(apartment, b)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="roomNumber">
              房间号
            </label>
            <input
              id="roomNumber"
              className="field"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="例如 101"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
            />
          </div>

          <button type="submit" className="btn-primary w-full py-3.5" disabled={busy}>
            {busy ? '处理中…' : '添加并进入'}
          </button>

          <p className="text-center text-xs text-slate-400">
            如果这个房间已经有人建过，会直接进入，不会重复创建
          </p>
        </form>
      </div>
    </div>
  )
}
