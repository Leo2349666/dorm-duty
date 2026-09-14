/**
 * 一次性脚本：给项目加上 PWA（离线缓存 + 添加到主屏幕）
 *
 * 会生成 / 修改这些文件：
 *   public/sw.js                  Service Worker（缓存策略）
 *   public/manifest.webmanifest   应用清单
 *   public/icon-192.png            图标（脚本现场生成，不依赖任何库）
 *   public/icon-512.png            图标
 *   index.html                     注册 Service Worker + 引用 manifest
 *
 * 用法：cd 到项目目录，然后 node add-pwa.mjs，再 npm run build。
 * 跑完确认没问题就可以删掉这个脚本。
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const pub = path.join(root, 'public')
const L = (...lines) => lines.join('\n')

if (!fs.existsSync(pub)) fs.mkdirSync(pub, { recursive: true })

// ============================================================ 1. Service Worker

const sw = L(
  '/* 寝室值日排班 —— Service Worker',
  ' *',
  ' * 缓存策略（重点是既能秒开、又不会让人看到旧版本）：',
  ' *',
  ' *   1. 页面导航（HTML）→ 网络优先。',
  ' *      每次打开都先问服务器要最新的，拿不到（断网）才用缓存兜底。',
  ' *      这样每次 git push 部署的新版本，用户下次打开就能拿到。',
  ' *',
  ' *   2. /assets/ 下的 JS、CSS → 缓存优先。',
  ' *      这些文件名里带内容哈希，内容一变文件名就变，缓存它们永远不会过期。',
  ' *',
  ' *   3. 其它同源资源（图标、manifest）→ 先给缓存，同时后台更新。',
  ' *',
  ' *   4. 跨域请求（比如 Supabase）→ 一律放行，不缓存。',
  ' */',
  '',
  "const CACHE = 'dorm-duty-v1'",
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
  '  // ---------- 1. 页面导航：网络优先 ----------',
  "  if (req.mode === 'navigate') {",
  '    event.respondWith(',
  '      (async () => {',
  '        try {',
  '          const res = await fetch(req)',
  '          const cache = await caches.open(CACHE)',
  "          cache.put('/index.html', res.clone())",
  '          return res',
  '        } catch {',
  "          const cached = await caches.match('/index.html')",
  '          return cached || Response.error()',
  '        }',
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
  '      const cached = await caches.match(req)',
  '      const network = fetch(req)',
  '        .then((res) => {',
  '          if (res && res.status === 200) {',
  '            caches.open(CACHE).then((c) => c.put(req, res.clone()))',
  '          }',
  '          return res',
  '        })',
  '        .catch(() => cached)',
  '      return cached || network',
  '    })(),',
  '  )',
  '})',
  '',
)

// ============================================================ 2. manifest

const manifest = JSON.stringify(
  {
    name: '寝室值日排班',
    short_name: '值日排班',
    description: '打开就能用的寝室值日排班表',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f5f6fa',
    theme_color: '#2563eb',
    lang: 'zh-CN',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  null,
  2,
)

// ============================================================ 3. 生成图标

const crcTable = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // 位深
  ihdr[9] = 6 // 颜色类型 RGBA
  const stride = size * 4 + 1
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0 // filter: none
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/** 点到线段的距离，用来画带圆头的粗线 */
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

/** 蓝底 + 白色对勾（坐标已归一化到 0~1） */
function iconColorAt(px, py) {
  const thickness = 0.072
  const onCheck =
    segDist(px, py, 0.28, 0.52, 0.44, 0.68) < thickness ||
    segDist(px, py, 0.44, 0.68, 0.73, 0.33) < thickness
  return onCheck ? [255, 255, 255] : [37, 99, 235]
}

function makeIcon(size) {
  const SS = 3 // 每个像素再切成 3×3 采样，让边缘平滑
  const rgba = Buffer.alloc(size * size * 4)
  const n = SS * SS
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const c = iconColorAt(
            (x * SS + sx + 0.5) / (size * SS),
            (y * SS + sy + 0.5) / (size * SS),
          )
          r += c[0]
          g += c[1]
          b += c[2]
        }
      }
      const i = (y * size + x) * 4
      rgba[i] = Math.round(r / n)
      rgba[i + 1] = Math.round(g / n)
      rgba[i + 2] = Math.round(b / n)
      rgba[i + 3] = 255
    }
  }
  return encodePng(size, rgba)
}

// ============================================================ 4. 改 index.html

const indexPath = path.join(root, 'index.html')
let html = fs.readFileSync(indexPath, 'utf8')
let htmlChanged = false

if (!html.includes('manifest.webmanifest')) {
  const anchor = '<title>寝室值日排班</title>'
  const i = html.indexOf(anchor)
  if (i < 0) {
    console.log('✗ index.html 里找不到 <title>，没法插入 manifest 引用')
    process.exit(1)
  }
  const inject = L(
    '    <!-- PWA：添加到主屏幕后像 App 一样打开 -->',
    '    <link rel="manifest" href="/manifest.webmanifest" />',
    '    <link rel="apple-touch-icon" href="/icon-192.png" />',
    '    <meta name="apple-mobile-web-app-title" content="值日排班" />',
    '',
  )
  html = html.slice(0, i) + inject + html.slice(i)
  htmlChanged = true
  console.log('✓ index.html：插入 manifest 和 apple-touch-icon')
} else {
  console.log('跳过（已经有 manifest 引用了）：index.html')
}

if (!html.includes("register('/sw.js')")) {
  const anchor = '</body>'
  const i = html.indexOf(anchor)
  if (i < 0) {
    console.log('✗ index.html 里找不到 </body>')
    process.exit(1)
  }
  const inject = L(
    '    <!-- 注册 Service Worker：只在 https 下注册，本地开发不受影响 -->',
    '    <script>',
    "      if ('serviceWorker' in navigator && location.protocol === 'https:') {",
    '        window.addEventListener(' + "'load'" + ', function () {',
    "          navigator.serviceWorker.register('/sw.js').catch(function () {})",
    '        })',
    '      }',
    '    </script>',
    '',
  )
  html = html.slice(0, i) + inject + html.slice(i)
  htmlChanged = true
  console.log('✓ index.html：插入 Service Worker 注册代码')
} else {
  console.log('跳过（已经有注册代码了）：index.html')
}

if (htmlChanged) fs.writeFileSync(indexPath, html, 'utf8')

// ============================================================ 5. 写文件

fs.writeFileSync(path.join(pub, 'sw.js'), sw, 'utf8')
console.log('✓ public/sw.js')

fs.writeFileSync(path.join(pub, 'manifest.webmanifest'), manifest + '\n', 'utf8')
console.log('✓ public/manifest.webmanifest')

fs.writeFileSync(path.join(pub, 'icon-192.png'), makeIcon(192))
console.log('✓ public/icon-192.png')

fs.writeFileSync(path.join(pub, 'icon-512.png'), makeIcon(512))
console.log('✓ public/icon-512.png')

console.log('')
console.log('PWA 加好了。接着跑：')
console.log('  npm run build')
console.log('  git add -A && git commit -m "add PWA" && git push')
console.log('')
console.log('部署完之后，用手机打开一次（第一次还是会慢），之后就秒开了。')
