import { useMemo, useState } from 'react'
import Avatar from '../components/Avatar'
import Modal from '../components/Modal'
import SortableList, { type SortableRenderArgs } from '../components/SortableList'
import { confirm } from '../store/useConfirm'
import { toast } from '../store/useToast'
import { useAppStore } from '../store/useAppStore'
import { cycleIndexOf, cycleRange, todayStr } from '../lib/date'
import type { Member } from '../types'

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

/**
 * 成员管理。
 *
 * 顺序在这里是有意义的：排班算法直接用这个顺序做轮换，
 * 所以拖一下顺序，下个周期的分工就会跟着变。
 */
export default function MembersPage() {
  const data = useAppStore((s) => s.data)
  const addMember = useAppStore((s) => s.addMember)
  const updateMember = useAppStore((s) => s.updateMember)
  const removeMember = useAppStore((s) => s.removeMember)
  const reorderMembers = useAppStore((s) => s.reorderMembers)
  const busy = useAppStore((s) => s.busy)

  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<Member | null>(null)
  const [editName, setEditName] = useState('')

  const list = useMemo(() => {
    if (!data) return []
    return data.members
      .filter((m) => !m.deletedAt)
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
  }, [data])

  if (!data) return null

  const activeCount = list.filter((m) => m.active).length

  /** 下一个周期从什么时候开始 —— 用来告诉用户新成员何时生效 */
  const nextCycleHint = (() => {
    const { startDate, endDate, periodDays } = data.room
    if (!data.days.length) return null
    const today = todayStr()
    if (today > endDate) return null
    const current = today < startDate ? -1 : cycleIndexOf(today, startDate, periodDays)
    const start = cycleRange(startDate, periodDays, current + 1).start
    if (start > endDate) return null
    return start
  })()

  async function handleAdd() {
    const name = draft.trim()
    if (!name) return
    if (list.some((m) => m.name === name)) {
      toast.error('已经有同名成员了')
      return
    }
    await addMember(name)
    setDraft('')
    toast.success(nextCycleHint ? `已添加，将从 ${nextCycleHint} 起的下一轮开始参与值日` : '已添加成员')
  }

  async function handleToggle(member: Member) {
    await updateMember(member.id, { active: !member.active })
  }

  async function handleDelete(member: Member) {
    const ok = await confirm({
      title: `删除成员「${member.name}」？`,
      message:
        '删除后他不会再参与排班，但历史记录里仍然保留他的名字，之前排好的班也不会被抹掉。\n\n如果只是暂时不在（比如请假、外出），建议改用「停用」，随时可以恢复。',
      confirmText: '删除',
      tone: 'danger',
    })
    if (!ok) return
    await removeMember(member.id)
    toast.success('已删除')
  }

  async function handleSaveName() {
    if (!editing) return
    const name = editName.trim()
    if (!name) return
    await updateMember(editing.id, { name })
    setEditing(null)
    toast.success('已保存')
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">成员管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          拖动左侧的手柄可以调整顺序，顺序决定了值日的轮换次序。
        </p>
      </header>

      {nextCycleHint ? (
        <p className="rounded-xl bg-blue-50 px-3.5 py-3 text-xs leading-relaxed text-blue-700">
          已经有排班了。新增或停用成员会从 <b>下一轮（{nextCycleHint} 起）</b> 开始生效，
          当前这一轮保持不变，不会打乱室友已经在执行的安排。
        </p>
      ) : null}

      <section className="card !p-3">
        <SortableList
          items={list}
          getId={(m) => m.id}
          onReorder={(ids) => void reorderMembers(ids)}
          renderItem={(member, { handleProps }) => (
            <div
              className={[
                'flex items-center gap-2.5 rounded-xl border border-slate-200/70 bg-white px-2 py-2.5',
                member.active ? '' : 'opacity-55',
              ].join(' ')}
            >
              <DragHandle handleProps={handleProps} />
              <Avatar name={member.name} size={34} solid={member.active} />
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  setEditing(member)
                  setEditName(member.name)
                }}
              >
                <span className="truncate text-sm font-semibold text-slate-800">{member.name}</span>
                {!member.active ? (
                  <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-500">
                    已停用
                  </span>
                ) : null}
                <span className="ml-2 text-[11px] text-slate-400">点击改名</span>
              </button>
              <button
                type="button"
                className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs text-slate-500 transition hover:bg-white"
                onClick={() => handleToggle(member)}
              >
                {member.active ? '停用' : '启用'}
              </button>
              <button
                type="button"
                className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs text-rose-500 transition hover:bg-rose-50"
                onClick={() => handleDelete(member)}
              >
                删除
              </button>
            </div>
          )}
        />
      </section>

      <section className="card">
        <label className="label" htmlFor="new-member">
          添加成员
        </label>
        <div className="flex gap-2">
          <input
            id="new-member"
            className="field flex-1"
            placeholder="输入姓名"
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
          当前 {activeCount} 名成员参与排班，共 {data.dutyItems.filter((i) => !i.deletedAt).length} 项值日内容。
          {activeCount > data.dutyItems.filter((i) => !i.deletedAt).length
            ? ' 人数多于项数，会自动安排多人共担。'
            : ''}
        </p>
      </section>

      <Modal
        open={editing !== null}
        title="修改姓名"
        onClose={() => setEditing(null)}
        footer={
          <div className="flex gap-3">
            <button type="button" className="btn-ghost flex-1" onClick={() => setEditing(null)}>
              取消
            </button>
            <button type="button" className="btn-primary flex-1" onClick={handleSaveName}>
              保存
            </button>
          </div>
        }
      >
        <input
          className="field"
          value={editName}
          autoFocus
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSaveName()
          }}
        />
        <p className="mt-2 text-xs text-slate-400">改名不会影响已生成的排班，历史记录里也会同步显示新名字。</p>
      </Modal>
    </div>
  )
}
