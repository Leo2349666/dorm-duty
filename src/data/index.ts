import type { DataAdapter } from './types'
import { LocalAdapter } from './local'
import { SupabaseAdapter } from './supabase'

/** 环境变量是否配齐了 */
export function cloudConfig(): { url: string; key: string } | null {
  const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
  if (!url || !key) return null
  // 防止把 .env.example 里的占位内容当成真配置
  if (!/^https?:\/\//.test(url)) return null
  return { url, key }
}

export function isCloudMode(): boolean {
  return cloudConfig() !== null
}

/**
 * 创建数据适配器。
 *
 * 这里是「一套代码两种模式」的开关：
 *  - 没配 Supabase → LocalAdapter（localStorage，零配置可用）
 *  - 配了 Supabase → SupabaseAdapter（匿名登录 + 实时同步）
 *
 * supabase-js 用**动态 import** 引入，纯本地模式下这个包根本不会被下载，
 * 微信里首次打开能少拉一百多 KB。
 */
export async function createAdapter(): Promise<DataAdapter> {
  const config = cloudConfig()
  if (!config) {
    const local = new LocalAdapter()
    await local.init()
    return local
  }

  try {
    const mod = await import('@supabase/supabase-js')
    const client = mod.createClient(config.url, config.key, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 4 } },
    })
    const adapter = new SupabaseAdapter(client as never)
    await adapter.init()
    return adapter
  } catch (err) {
    // 云端初始化失败时不能把用户挡在门外，退回本地模式并明确告知
    console.error('[dorm-duty] 云端模式不可用，已自动切换为纯本地模式', err)
    const local = new LocalAdapter()
    await local.init()
    return local
  }
}
