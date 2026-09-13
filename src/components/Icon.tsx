interface IconProps {
  /** SVG path 的 d 属性 */
  path: string
  size?: number
  className?: string
  strokeWidth?: number
}

/**
 * 统一的线性图标。
 *
 * 关键点是**线宽跟着尺寸走**：同样 1.7 的线宽，在 16px 的图标上看着很粗、
 * 在 24px 上又显得很细，放在一起就会觉得"图标风格不统一"。
 * 这里统一按尺寸的 9% 计算线宽，任意大小摆在一起观感都一致。
 */
export default function Icon({ path, size = 20, className, strokeWidth }: IconProps) {
  const sw = strokeWidth ?? Math.round(size * 0.09 * 10) / 10
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  )
}
