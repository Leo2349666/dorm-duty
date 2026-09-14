/* 寝室值日排班 —— Service Worker
 *
 * 缓存策略（重点是既能秒开、又不会让人看到旧版本）：
 *
 *   1. 页面导航（HTML）→ 网络优先。
 *      每次打开都先问服务器要最新的，拿不到（断网）才用缓存兜底。
 *      这样每次 git push 部署的新版本，用户下次打开就能拿到。
 *
 *   2. /assets/ 下的 JS、CSS → 缓存优先。
 *      这些文件名里带内容哈希，内容一变文件名就变，缓存它们永远不会过期。
 *
 *   3. 其它同源资源（图标、manifest）→ 先给缓存，同时后台更新。
 *
 *   4. 跨域请求（比如 Supabase）→ 一律放行，不缓存。
 */

const CACHE = 'dorm-duty-v1'

self.addEventListener('install', () => {
  // 不等旧页面关闭，立刻接管
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 清掉旧版本留下的缓存
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  let url
  try {
    url = new URL(req.url)
  } catch {
    return
  }
  // 只处理同源请求，跨域的（Supabase 等）直接放行
  if (url.origin !== self.location.origin) return

  // ---------- 1. 页面导航：网络优先 ----------
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          const cache = await caches.open(CACHE)
          cache.put('/index.html', res.clone())
          return res
        } catch {
          const cached = await caches.match('/index.html')
          return cached || Response.error()
        }
      })(),
    )
    return
  }

  // ---------- 2. 带哈希的静态资源：缓存优先 ----------
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req)
        if (cached) return cached
        const res = await fetch(req)
        if (res && res.status === 200) {
          const cache = await caches.open(CACHE)
          cache.put(req, res.clone())
        }
        return res
      })(),
    )
    return
  }

  // ---------- 3. 其它同源资源：先用缓存，同时后台更新 ----------
  event.respondWith(
    (async () => {
      const cached = await caches.match(req)
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            caches.open(CACHE).then((c) => c.put(req, res.clone()))
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    })(),
  )
})
