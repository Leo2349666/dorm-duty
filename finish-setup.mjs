/**
 * 收尾脚本：把自定义域名 dorm-duty.com 需要的改动全部落实
 *
 * 这一步做三件事，每一步都会打印改前/改后的原文，方便核对：
 *   1. vite.config.ts 的 base 改成 '/'（不管现在是什么值，统一改掉）
 *   2. src/pages/SettingsPage.tsx 里确保取出了 enterRoom
 *      （没有的话，导入了 JSON 之后没法跳转，而且会编译报错）
 *   3. 检查 public/CNAME 内容
 *
 * 用法：
 *   cd "E:\项目\寝室值日排班"
 *   node finish-setup.mjs
 *   npm run build
 *
 * 跑完确认构建通过，就可以把 finish-setup.mjs、apply-domain.mjs、fix-import.mjs 都删掉。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const write = (p, s) => fs.writeFileSync(path.join(root, p), s, 'utf8')

let problems = []

console.log('========================================')
console.log(' 1. vite.config.ts 的 base')
console.log('========================================')

let vite = read('vite.config.ts')
const baseLineMatch = vite.match(/^\s*\/\/.*\n\s*base:.*$/m) || vite.match(/^\s*base:.*$/m)
const currentBase = vite.match(/^\s*base:\s*(['"])(.*?)\1/m)

console.log('当前：' + (currentBase ? currentBase[0].trim() : '（没找到 base 行！）'))

if (!currentBase) {
  problems.push('vite.config.ts 里找不到 base 配置行')
} else if (currentBase[2] === '/') {
  console.log('已经是 / ，不用改。')
} else {
  // 不管当前值是 '/dorm-duty/' 还是别的，统一替换成 '/'
  vite = vite.replace(/^(\s*base:\s*)(['"])[^'"]*\2/m, "$1'/'")
  write('vite.config.ts', vite)
  const after = read('vite.config.ts').match(/^\s*base:\s*(['"])(.*?)\1/m)
  console.log('已改成：' + (after ? after[0].trim() : '?'))
}

console.log('')
console.log('========================================')
console.log(' 2. SettingsPage.tsx 的 enterRoom')
console.log('========================================')

let settings = read('src/pages/SettingsPage.tsx')

if (settings.includes('const enterRoom = useAppStore')) {
  console.log('已经取出了 enterRoom，不用改。')
} else {
  const anchor = 'const importRoom = useAppStore((s) => s.importRoom)'
  const i = settings.indexOf(anchor)
  if (i < 0) {
    console.log('✗ 找不到锚点：' + anchor)
    problems.push('SettingsPage.tsx 里找不到 importRoom 那一行')
  } else {
    const eol = settings.indexOf('\n', i)
    settings =
      settings.slice(0, eol + 1) +
      '  const enterRoom = useAppStore((s) => s.enterRoom)\n' +
      settings.slice(eol + 1)
    write('src/pages/SettingsPage.tsx', settings)
    console.log('已在 importRoom 后面补上：const enterRoom = useAppStore((s) => s.enterRoom)')
  }
}

// 顺手确认代码里确实用到了 enterRoom，避免只声明不用导致的困惑
const settingsAfter = read('src/pages/SettingsPage.tsx')
console.log(
  settingsAfter.includes('await enterRoom(')
    ? '✓ 代码里确实调用了 enterRoom'
    : '⚠ 代码里没有调用 enterRoom —— 请把 doImport 结尾那段发我看看',
)

console.log('')
console.log('========================================')
console.log(' 3. public/CNAME')
console.log('========================================')

if (!fs.existsSync(path.join(root, 'public', 'CNAME'))) {
  console.log('✗ public/CNAME 不存在')
  problems.push('public/CNAME 缺失')
} else {
  const content = read('public/CNAME').trim()
  console.log('内容 = ' + content)
  if (content !== 'dorm-duty.com') {
    console.log('✗ 内容不对，应该是 dorm-duty.com')
    problems.push('public/CNAME 内容不是 dorm-duty.com')
  } else {
    console.log('✓ 正确')
  }
}

console.log('')
console.log('========================================')
if (problems.length) {
  console.log('有 ' + problems.length + ' 个问题没解决：')
  problems.forEach((p) => console.log('  · ' + p))
  console.log('把上面的输出整个发我。')
  process.exit(1)
}
console.log('全部搞定。接着跑：npm run build')
console.log('构建通过后再 git add / commit / push。')
