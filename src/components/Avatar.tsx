import { withAlpha } from '../lib/constants'

const AVATAR_COLORS = [
  '#3b82f6',
  '#f59e0b',
  '#10b981',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#6366f1',
  '#ef4444',
  '#84cc16',
  '#f97316',
]

function hashOf(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h
}

/**
 * 取名字里最有辨识度的一个字符做头像。
 * 默认成员名是「成员1」「成员2」这种，如果取首字全都一样，
 * 所以规则是：以数字或字母结尾就取最后一个字符，否则取首字（符合中文取姓氏的习惯）。
 */
export function initialOf(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const last = trimmed[trimmed.length - 1]
  if (/[0-9A-Za-z]/.test(last)) return last.toUpperCase()
  return trimmed[0]
}

interface AvatarProps {
  name: string
  /** 直径，默认 28px */
  size?: number
  /** 指定颜色（比如值日项的配色）。不传就按名字自动分配一个稳定颜色 */
  color?: string
  /** 实心高亮，用于"这是我"的场景 */
  solid?: boolean
}

export default function Avatar({ name, size = 28, color, solid = false }: AvatarProps) {
  const base = color ?? AVATAR_COLORS[hashOf(name) % AVATAR_COLORS.length]
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none"
      style={{
        width: size,
        height: size,
        backgroundColor: solid ? base : withAlpha(base, 0.15),
        color: solid ? '#ffffff' : base,
        fontSize: Math.round(size * 0.45),
      }}
      aria-hidden="true"
    >
      {initialOf(name)}
    </span>
  )
}
