/**
 * 生成唯一 id。
 *
 * 为什么不用 crypto.randomUUID() 一把梭？
 * 因为它只在「安全上下文」里可用 —— https 和 localhost 可以，
 * 但用手机连电脑的局域网地址（http://192.168.x.x:5173）调试时它不存在，
 * 直接调用会抛错让页面白屏。所以这里做一层兜底。
 */
export function uid(): string {
  const g = globalThis as unknown as { crypto?: Crypto }
  if (g.crypto && typeof g.crypto.randomUUID === 'function') {
    try {
      return g.crypto.randomUUID()
    } catch {
      /* 某些老 WebView 会抛错，继续走下面的兜底 */
    }
  }
  if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    g.crypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** 简易防抖，用于合并 Realtime 的连续推送 */
export function debounce<T extends (...args: never[]) => void>(fn: T, wait: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: never[]) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }) as T
}
