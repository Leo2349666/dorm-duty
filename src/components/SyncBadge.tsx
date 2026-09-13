import { useAppStore } from '../store/useAppStore'

const TEXT: Record<string, string> = {
  local: '仅本机',
  synced: '已同步',
  syncing: '同步中',
  offline: '离线',
}

const DOT: Record<string, string> = {
  local: 'bg-slate-400',
  synced: 'bg-emerald-500',
  syncing: 'bg-amber-400 animate-pulse',
  offline: 'bg-rose-500',
}

/**
 * 同步状态指示灯。
 * 这枚小圆点让用户随时知道「我的改动到底有没有传上去」，
 * 而不是等换手机时才发现数据没同步。
 */
export default function SyncBadge({ withText = true }: { withText?: boolean }) {
  const status = useAppStore((s) => s.syncStatus)
  const cloudMode = useAppStore((s) => s.cloudMode)
  const label = cloudMode ? TEXT[status] ?? '未知' : '仅本机'
  const hint = cloudMode ? '已开启云端同步' : '未配置云端，数据只存在本机'

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500" title={hint}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[status] ?? 'bg-slate-400'}`} />
      {withText ? label : null}
    </span>
  )
}
