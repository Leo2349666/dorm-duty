import type { CSSProperties, MouseEventHandler, ReactNode, TouchEventHandler } from 'react'
import { useEffect, useState } from 'react'
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export interface SortableHandleProps {
  ref: (node: HTMLElement | null) => void
  onMouseDown?: MouseEventHandler<HTMLElement>
  onTouchStart?: TouchEventHandler<HTMLElement>
  style?: CSSProperties
  'aria-label'?: string
  role?: string
  tabIndex?: number
  'aria-describedby'?: string
}

export interface SortableRenderArgs {
  /** 把这些属性展开到一个 <button> 上，它就是"拖拽把手" */
  handleProps: SortableHandleProps
  isDragging: boolean
}

interface SortableItemProps<T> {
  item: T
  id: string
  render: (item: T, args: SortableRenderArgs) => ReactNode
}

function SortableItem<T>({ item, id, render }: SortableItemProps<T>) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id })

  const handleProps = {
    ...attributes,
    ref: setActivatorNodeRef,
    onMouseDown: listeners?.onMouseDown as MouseEventHandler<HTMLElement> | undefined,
    onTouchStart: listeners?.onTouchStart as TouchEventHandler<HTMLElement> | undefined,
    style: { touchAction: 'none', cursor: 'grab' } as CSSProperties,
    'aria-label': '拖动排序',
  } as SortableHandleProps

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'relative z-10' : undefined}
    >
      {render(item, { handleProps, isDragging })}
    </div>
  )
}

interface SortableListProps<T> {
  items: T[]
  getId: (item: T) => string
  onReorder: (orderedIds: string[]) => void
  renderItem: (item: T, args: SortableRenderArgs) => ReactNode
}

/**
 * 移动端可用的拖拽排序列表。
 *
 * 关键点：用的是 MouseSensor + TouchSensor，而不是 HTML5 原生拖拽 ——
 * 原生 drag & drop 在手机上完全不响应，微信里更拖不动。
 * TouchSensor 加了 180ms 长按延迟，手指在列表上滑动时是正常滚动页面，
 * 只有"按住不动再拖"才触发排序。
 */
export default function SortableList<T>({ items, getId, onReorder, renderItem }: SortableListProps<T>) {
  const [ids, setIds] = useState<string[]>(() => items.map(getId))
  const signature = items.map(getId).join('|')

  useEffect(() => {
    setIds(items.map(getId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(ids, oldIndex, newIndex)
    setIds(next) // 先本地更新，松手立刻跟手
    onReorder(next)
  }

  // 按本地 ids 顺序渲染，保证拖拽过程不会跳回原位
  const byId = new Map(items.map((item) => [getId(item), item]))
  const ordered = ids.map((id) => byId.get(id)).filter((x): x is T => x !== undefined)

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {ordered.map((item) => (
            <SortableItem key={getId(item)} id={getId(item)} item={item} render={renderItem} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
