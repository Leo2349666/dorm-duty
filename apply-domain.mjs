/**
 * 一次性脚本：切换到自定义域名 dorm-duty.com
 *
 * 做两件事：
 *   1. 把 vite.config.ts 的 base 从 '/dorm-duty/' 改成 '/'
 *      （绑了自定义域名后站点发布在域名根目录，不改会白屏）
 *   2. 顺手把之前那个「导入 JSON」的 bug 也修掉
 *      （如果你已经跑过 fix-import.mjs，这里会自动跳过，不会重复改）
 *
 * 用法：
 *   cd "E:\项目\寝室值日排班"
 *   node apply-domain.mjs
 *   npm run build
 *
 * 跑完确认没问题就可以把 apply-domain.mjs 和 fix-import.mjs 都删掉。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const L = (...lines) => lines.join('\n')

const edits = []
const edit = (file, find, replace, label) => edits.push({ file, find, replace, label })

// ---------------------------------------------------- vite.config.ts：base

edit(
  'vite.config.ts',
  "  base: '/dorm-duty/',",
  L(
    '  // 绑定了自定义域名 dorm-duty.com 之后，站点发布在域名根目录，',
    "  // 所以 base 必须是 '/'。用 GitHub Pages 默认地址时才需要 '/仓库名/'。",
    "  base: '/',",
  ),
  'vite.config.ts：base 改成 /',
)

// -------------------------------------------- 导入 bug（跑过就自动跳过）

edit(
  'src/store/useAppStore.ts',
  '  importRoom: (payload: ImportPayload) => Promise<void>',
  '  importRoom: (payload: ImportPayload) => Promise<string | null>',
  'appStore：接口声明改为返回房间 id',
)

edit(
  'src/store/useAppStore.ts',
  L(
    '      const { adapter } = get()',
    '      if (!adapter) return',
    '      const { room, members, dutyItems, days } = payload',
  ),
  L(
    '      const { adapter, data } = get()',
    '      if (!adapter) return null',
    '      const { room, members, dutyItems, days } = payload',
  ),
  'appStore：多取一个 data，返回值改成 null',
)

edit(
  'src/store/useAppStore.ts',
  L(
    '      if (existing) {',
    '        await adapter.saveMembers(members)',
    '        await adapter.saveItems(dutyItems)',
    '      } else {',
  ),
  L(
    '      if (existing) {',
    '        // 1) 先把原有排班全部清掉，避免和导入的数据混在一起',
    "        await adapter.clearPlansFrom(targetId, '0001-01-01')",
    '',
    '        // 2) 导入的正是当前打开的这个房间时，把原有的成员和值日项整体停用。',
    '        //    否则两边 id 不同，saveMembers 只会「新增」，',
    '        //    结果房间里会同时存在两套人（比如变成 10 个人）。',
    '        if (data && data.room.id === targetId) {',
    '          const stamp = new Date().toISOString()',
    '          const importedMemberIds = new Set(members.map((m) => m.id))',
    '          const importedItemIds = new Set(dutyItems.map((i) => i.id))',
    '          const retiredMembers = data.members',
    '            .filter((m) => !m.deletedAt && !importedMemberIds.has(m.id))',
    '            .map((m) => ({ ...m, active: false, deletedAt: stamp }))',
    '          const retiredItems = data.dutyItems',
    '            .filter((i) => !i.deletedAt && !importedItemIds.has(i.id))',
    '            .map((i) => ({ ...i, deletedAt: stamp }))',
    '          if (retiredMembers.length) await adapter.saveMembers(retiredMembers)',
    '          if (retiredItems.length) await adapter.saveItems(retiredItems)',
    '        }',
    '',
    '        await adapter.saveMembers(members)',
    '        await adapter.saveItems(dutyItems)',
    '      } else {',
  ),
  'appStore：导入时清空旧排班 + 停用旧成员（修 bug 1）',
)

edit(
  'src/store/useAppStore.ts',
  L('      set({ rooms: upsertLocalRoom(ref) })', '    },'),
  L('      set({ rooms: upsertLocalRoom(ref) })', '      return targetId', '    },'),
  'appStore：importRoom 返回导入后的房间 id',
)

edit(
  'src/pages/SettingsPage.tsx',
  '  const refreshRooms = useAppStore((s) => s.refreshRooms)',
  L(
    '  const refreshRooms = useAppStore((s) => s.refreshRooms)',
    '  const enterRoom = useAppStore((s) => s.enterRoom)',
  ),
  'settings：取出 enterRoom',
)

edit(
  'src/pages/SettingsPage.tsx',
  L(
    '    await importRoom(payload)',
    '    refreshRooms()',
    '    if (payload.room.id === room.id) await reload()',
    "    toast.success('导入完成')",
  ),
  L(
    '    const targetId = await importRoom(payload)',
    '    refreshRooms()',
    '    if (targetId && targetId === room.id) {',
    '      // 导入的就是当前这个房间：直接重新读一次',
    '      await reload()',
    '    } else if (targetId) {',
    '      // 导入的是另一个房间：跳过去，别让人以为「什么都没发生」',
    '      await enterRoom(targetId)',
    '      navigate(`/room/${targetId}`)',
    '    }',
    "    toast.success('导入完成')",
  ),
  'settings：导入后刷新当前房间或跳转到导入的房间（修 bug 2）',
)

// ------------------------------------------------------------------ 执行

const sources = new Map()
let failed = false

console.log('正在检查锚点…')
console.log('')

for (const e of edits) {
  const full = path.join(root, e.file)
  if (!sources.has(full)) sources.set(full, fs.readFileSync(full, 'utf8'))
  const src = sources.get(full)
  const i = src.indexOf(e.find)
  if (i < 0) {
    const done = src.includes(e.replace)
    console.log((done ? '跳过（已经是新代码）：' : '✗ 找不到锚点：') + e.label + '   —— ' + e.file)
    if (!done) failed = true
    continue
  }
  sources.set(full, src.slice(0, i) + e.replace + src.slice(i + e.find.length))
  console.log('✓ ' + e.label)
}

// CNAME 文件
const cnamePath = path.join(root, 'public', 'CNAME')
const cnameOk = fs.existsSync(cnamePath) && fs.readFileSync(cnamePath, 'utf8').trim() === 'dorm-duty.com'
console.log(cnameOk ? '✓ public/CNAME 已存在且内容正确' : '✗ public/CNAME 缺失或内容不对')
if (!cnameOk) failed = true

if (failed) {
  console.log('')
  console.log('有地方没搞定，为避免改坏文件，没有写入任何内容。')
  console.log('把上面带 ✗ 的行发给我。')
  process.exit(1)
}

console.log('')
for (const entry of sources) {
  fs.writeFileSync(entry[0], entry[1], 'utf8')
  console.log('已写入 ' + path.relative(root, entry[0]))
}

console.log('')
console.log('完成。接着跑：npm run build')
console.log('确认没问题后可以删掉 apply-domain.mjs 和 fix-import.mjs。')
