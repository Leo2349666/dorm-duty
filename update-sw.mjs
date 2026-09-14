/**
 * 一次性脚本：把 Service Worker 的页面策略从「网络优先」改成「缓存优先 + 后台更新」
 *
 * 为什么要改：
 *   原来的策略每次打开都要先跨境问服务器要一次 HTML，这一趟就要好几秒。
 *   改成缓存优先后，第二次起是瞬间打开，同时后台悄悄更新。
 *
 * 代价：你部署新版本后，用户第一次打开看到的是旧版（后台已更新），
 *       第二次打开才是新版。对这类工具完全可接受。
 *
 * 用法：cd 到项目目录，node update-sw.mjs，然后 npm run build
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const L = (...lines) => lines.join('\n')

const sw = L(
  '/* 寝室值日排班 —— Service Worker',
  ' *',
  ' * 缓存策略：',
  ' *',
  ' *   1. 页面导航（HTML）→ 缓存优先 + 后台更新',
  ' *      打开时立刻用本地缓存渲染（秒开），同时后台去服务器取最新版存起来。',
  ' *      所以：第二次起瞬间打开；部署新版本后，用户第一次看到旧版、',
  ' *      第二次就是新版。',
  ' *',
  ' *   2. /assets/ 下的 JS、CSS → 缓存优先',
  ' *      文件名里带内容哈希，内容一变文件名就变，缓存它们永远不会过期。',
  ' *      新版本会引入新文件名，所以不会拿到旧代码。',
  ' *',
  ' *   3. 其它同源资源（图标、manifest）→ 缓存优先 + 后台更新。',
  ' *',
  ' *   4. 跨域请求（比如 Supabase）→ 一律放行，不缓存。',
  ' */',
  '',
  "const CACHE = 'dorm-duty-v2'",
  '',
  "self.addEventListener('install', () => {",
  '  // 不等旧页面关闭，立刻接管',
  '  self.skipWaiting()',
  '})',
  '',
  "self.addEventListener('activate', (event) => {",
  '  event.waitUntil(',
  '    (async () => {',
  '      // 清掉旧版本留下的缓存',
  '      const keys = await caches.keys()',
  '      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))',
  '      await self.clients.claim()',
  '    })(),',
  '  )',
  '})',
  '',
  "self.addEventListener('fetch', (event) => {",
  '  const req = event.request',
  "  if (req.method !== 'GET') return",
  '',
  '  let url',
  '  try {',
  '    url = new URL(req.url)',
  '  } catch {',
  '    return',
  '  }',
  '  // 只处理同源请求，跨域的（Supabase 等）直接放行',
  '  if (url.origin !== self.location.origin) return',
  '',
  '  // ---------- 1. 页面导航：缓存优先 + 后台更新 ----------',
  "  if (req.mode === 'navigate') {",
  '    event.respondWith(',
  '      (async () => {',
  '        const cache = await caches.open(CACHE)',
  "        const cached = await cache.match('/index.html')",
  '        const network = fetch(req)',
  '          .then((res) => {',
  '            if (res && res.status === 200) {',
  "              cache.put('/index.html', res.clone())",
  '            }',
  '            return res',
  '          })',
  '          .catch(() => null)',
  '',
  '        if (cached) {',
  '          // 有缓存就立刻返回，让页面秒开；同时把后台更新挂在这个事件上，',
  '          // 免得 Service Worker 被浏览器提前回收导致更新半途中断',
  '          event.waitUntil(network)',
  '          return cached',
  '        }',
  '        const fresh = await network',
  '        return fresh || Response.error()',
  '      })(),',
  '    )',
  '    return',
  '  }',
  '',
  '  // ---------- 2. 带哈希的静态资源：缓存优先 ----------',
  "  if (url.pathname.startsWith('/assets/')) {",
  '    event.respondWith(',
  '      (async () => {',
  '        const cached = await caches.match(req)',
  '        if (cached) return cached',
  '        const res = await fetch(req)',
  '        if (res && res.status === 200) {',
  '          const cache = await caches.open(CACHE)',
  '          cache.put(req, res.clone())',
  '        }',
  '        return res',
  '      })(),',
  '    )',
  '    return',
  '  }',
  '',
  '  // ---------- 3. 其它同源资源：先用缓存，同时后台更新 ----------',
  '  event.respondWith(',
  '    (async () => {',
  '      const cache = await caches.open(CACHE)',
  '      const cached = await cache.match(req)',
  '      const network = fetch(req)',
  '        .then((res) => {',
  '          if (res && res.status === 200) cache.put(req, res.clone())',
  '          return res',
  '        })',
  '        .catch(() => null)',
  '      if (cached) {',
  '        event.waitUntil(network)',
  '        return cached',
  '      }',
  '      const fresh = await network',
  '      return fresh || Response.error()',
  '    })(),',
  '  )',
  '})',
  '',
)

const target = path.join(root, 'public', 'sw.js')
fs.writeFileSync(target, sw, 'utf8')
console.log('✓ 已更新 public/sw.js（缓存名升到 dorm-duty-v2）')
console.log('')
console.log('接着跑：')
console.log('  npm run build')
console.log('  git add -A')
console.log('  git commit -m "PWA 改成缓存优先，第二次起秒开"')
console.log('  git push')
