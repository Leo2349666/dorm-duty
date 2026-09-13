import { useMemo, useState } from 'react'
import Modal from '../components/Modal'
import SortableList, { type SortableRenderArgs } from '../components/SortableList'
import { COLOR_PALETTE, withAlpha } from '../lib/constants'
import { confirm } from '../store/useConfirm'
import { toast } from '../store/useToast'
import { useAppStore } from '../store/useAppStore'
import type { DutyItem } from '../types'

function DragHandle({ handleProps }: { handleProps: SortableRenderArgs['handleProps'] }) {
  return (
    <button
      type="button"
      {...handleProps}
      className="-ml-1 shrink-0 rounded-lg p-2 text-slate-300 transition hover:text-slate-500 active:text-blue-500"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="9" cy="6" r="1.6" />
        <circle cx="15" cy="6" r="1.6" />
        <circle cx="9" cy="12" r="1.6" />
        <circle cx="15" cy="12" r="1.6" />
        <circle cx="9" cy="18" r="1.6" />
        <circle cx="15" cy="18" r="1.6" />
      </svg>
    </button>
  )
}

/** 值日内容管理：增删改 + 拖拽排序 + 颜色（颜色用于日历和首页一眼辨认） */
export default function ItemsPage() {
  const data = useAppStore((s) => s.data)
  const addDutyItem = useAppStore((s) => s.addDutyItem)
  const updateDutyItem = useAppStore((s) => s.updateDutyItem)
  const removeDutyItem = useAppStore((s) => s.removeDutyItem)
  const reorderDutyItems = useAppStore((s) => s.reorderDutyItems)
  const busy = useAppStore((s) => s.busy)

  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<DutyItem | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState(COLOR_PALETTE[0].hex)

  const list = useMemo(() => {
    if (!data) return []
    return data.dutyItems
      .filter((i) => !i.deletedAt)
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
  }, [data])

  if (!data) return null

  const memberCount = data.members.filter((m) => m.active && !m.deletedAt).length

  async function handleAdd() {
    const name = draft.trim()
    if (!name) return
    if (list.some((i) => i.name === name)) {
      toast.error('已经有同名值日项了')
      return
    }
    await addDutyItem(name)
    setDraft('')
    toast.success('已添加')
  }

  async function handleDelete(item: DutyItem) {
    if (list.length <= 1) {
      toast.error('至少要保留一项值日内容')
      return
    }
    const ok = await confirm({
      title: `删除「${item.name}」？`,
      message: '删除后不再参与新的排班，但历史记录和已生成的排班仍然可以看到这项内容。',
      confirmText: '删除',
      tone: 'danger',
    })
    if (!ok) return
    await removeDutyItem(item.id)
    toast.success('已删除')
  }

  async function handleSave() {
    if (!editing) return
    const name = editName.trim()
    if (!name) return
    await updateDutyItem(editing.id, { name, color: editColor })
    setEditing(null)
    toast.success('已保存')
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">值日内容</h1>
        <p className="mt-1 text-sm text-slate-500">
          顺序决定第一轮谁负责哪一项：第 1 位成员对应第 1 项，依此类推。
        </p>
      </header>

      <section className="card !p-3">
        <SortableList
          items={list}
          getId={(i) => i.id}
          onReorder={(ids) => void reorderDutyItems(ids)}
          renderItem={(item, { handleProps }) => (
            <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/70 bg-white px-2 py-2.5">
              <DragHandle handleProps={handleProps} />
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: withAlpha(item.color, 0.13) }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  setEditing(item)
                  setEditName(item.name)
                  setEditColor(item.color)
                }}
              >
                <span className="truncate text-sm font-semibold text-slate-800">{item.name}</span>
                <span className="ml-2 text-[11px] text-slate-400">点击修改</span>
              </button>
              <span
                className="shrink-0 rounded-full px-2.5 py-1 text-[11px]"
                style={{ backgroundColor: withAlpha(item.color, 0.14), color: item.color }}
              >
                第 {item.orderIndex + 1} 项
              </span>
              <button
                type="button"
                className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs text-rose-500 transition hover:bg-rose-50"
                onClick={() => handleDelete(item)}
              >
                删除
              </button>
            </div>
          )}
        />
      </section>

      <section className="card">
        <label className="label" htmlFor="new-item">
          添加值日内容
        </label>
        <div className="flex gap-2">
          <input
            id="new-item"
            className="field flex-1"
            placeholder="例如 擦桌子"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAdd()
            }}
          />
          <button type="button" className="btn-primary shrink-0 px-5" onClick={handleAdd} disabled={busy}>
            添加
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          共 {list.length} 项值日内容，{memberCount} 名成员。
          {memberCount > list.length ? ' 人数多于项数，会自动安排多人共担同一项。' : ''}
        </p>
      </section>

      <Modal
        open={editing !== null}
        title="修改值日内容"
        onClose={() => setEditing(null)}
        footer={
          <div className="flex gap-3">
            <button type="button" className="btn-ghost flex-1" onClick={() => setEditing(null)}>
              取消
            </button>
            <button type="button" className="btn-primary flex-1" onClick={handleSave}>
              保存
            </button>
          </div>
        }
      >
        <label className="label" htmlFor="item-name">
          名称
        </label>
        <input
          id="item-name"
          className="field"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
        />

        <p className="label mt-4">颜色</p>
        <div className="flex flex-wrap gap-2.5">
          {COLOR_PALETTE.map((c) => (
            <button
              key={c.hex}
              type="button"
              aria-label={c.name}
              onClick={() => setEditColor(c.hex)}
              className={[
                'h-9 w-9 rounded-full transition',
                editColor === c.hex ? 'ring-2 ring-slate-900 ring-offset-2' : '',
              ].join(' ')}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          颜色会用在首页和日历上，方便一眼分辨不同的值日项。
        </p>
      </Modal>
    </div>
  )
}
