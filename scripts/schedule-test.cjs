/**
 * 排班算法自检脚本。
 *
 * 运行方式：npm run verify
 *
 * 它会用真实的需求文档里的例子逐条验证轮换规则，包括：
 *   - 3 人 3 项的经典示例（甲阳台 → 下轮丙阳台）
 *   - 5 人 5 项的一一对应
 *   - 4 人 5 项、6 人 5 项这两种"人数和项数不相等"的情况
 *   - 周期长度的计算，以及最后一个不足整周期的情况
 *   - "从此以后改轮换基线"的反推
 *
 * 改动 src/lib/schedule.ts 之后跑一遍，能立刻知道有没有破坏规则。
 */
const fs = require('fs')
const path = require('path')

// tsc 生成的是 CommonJS，但这个项目的 package.json 里是 "type": "module"，
// 所以先给编译产物目录单独放一个 package.json 声明它是 CommonJS。
const outDir = path.join(__dirname, '..', '.schedule-test')
if (!fs.existsSync(path.join(outDir, 'package.json'))) {
  fs.writeFileSync(path.join(outDir, 'package.json'), '{"type":"commonjs"}')
}

const { buildCycleSlots, rotateRight, deriveBaseline, reorderBy } = require('../.schedule-test/lib/schedule.js')
const { cycleIndexOf, cycleRange } = require('../.schedule-test/lib/date.js')

let failed = 0
function check(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    console.log('PASS  ' + name)
  } else {
    failed += 1
    console.log('FAIL  ' + name + '\n      期望 ' + e + '\n      实际 ' + a)
  }
}

const M = (name, orderIndex) => ({
  id: name,
  roomId: 'r',
  name,
  orderIndex,
  active: true,
  deletedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
})
const I = (name, orderIndex) => ({
  id: name,
  roomId: 'r',
  name,
  orderIndex,
  color: '#000',
  deletedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
})

const pairOf = (slots) => slots.map((s) => s.memberId + '-' + s.dutyItemId)

// ---- 用例 1：需求文档里的 3 人示例 ----
const three = [M('甲', 0), M('乙', 1), M('丙', 2)]
const it3 = [I('阳台', 0), I('地面', 1), I('倒垃圾', 2)]

check('第 0 轮：甲阳台 / 乙地面 / 丙倒垃圾', pairOf(buildCycleSlots(three, it3, 0)), [
  '甲-阳台',
  '乙-地面',
  '丙-倒垃圾',
])
check('第 1 轮：丙阳台 / 甲地面 / 乙倒垃圾（循环右移一位）', pairOf(buildCycleSlots(three, it3, 1)), [
  '丙-阳台',
  '甲-地面',
  '乙-倒垃圾',
])
check('第 2 轮：乙阳台 / 丙地面 / 甲倒垃圾', pairOf(buildCycleSlots(three, it3, 2)), [
  '乙-阳台',
  '丙-地面',
  '甲-倒垃圾',
])
check('第 3 轮回到第 0 轮（3 人 3 项，周期为 3）', pairOf(buildCycleSlots(three, it3, 3)), [
  '甲-阳台',
  '乙-地面',
  '丙-倒垃圾',
])

// ---- 用例 2：5 人 5 项（默认配置） ----
const five = [M('A', 0), M('B', 1), M('C', 2), M('D', 3), M('E', 4)]
const fiveItems = ['阳台', '地面', '倒垃圾', '洗手台', '浴室'].map((n, i) => I(n, i))
check('5 人 5 项：一一对应', pairOf(buildCycleSlots(five, fiveItems, 0)), [
  'A-阳台',
  'B-地面',
  'C-倒垃圾',
  'D-洗手台',
  'E-浴室',
])

// ---- 用例 3：人少项多（4 人 5 项）—— 循环分配，一人多岗 ----
const four = [M('A', 0), M('B', 1), M('C', 2), M('D', 3)]
const slots4 = buildCycleSlots(four, fiveItems, 0)
check('4 人 5 项：第 1 个人兼第 5 项', pairOf(slots4), ['A-阳台', 'B-地面', 'C-倒垃圾', 'D-洗手台', 'A-浴室'])
check(
  '4 人 5 项：每人至少一项',
  four.every((m) => slots4.some((s) => s.memberId === m.id)),
  true,
)
check(
  '4 人 5 项：每一项都有人',
  fiveItems.every((it) => slots4.some((s) => s.dutyItemId === it.id)),
  true,
)
const totals4 = {}
for (let k = 0; k < 4; k += 1) {
  for (const s of buildCycleSlots(four, fiveItems, k)) totals4[s.memberId] = (totals4[s.memberId] || 0) + 1
}
check('4 人 5 项：4 轮累计后人人相等', Object.values(totals4).sort(), [5, 5, 5, 5])

// ---- 用例 4：人多项少（6 人 5 项）—— 多人共担 ----
const six = [M('A', 0), M('B', 1), M('C', 2), M('D', 3), M('E', 4), M('F', 5)]
const slots6 = buildCycleSlots(six, fiveItems, 0)
check('6 人 5 项：阳台由 A、F 共担', pairOf(slots6), [
  'A-阳台',
  'B-地面',
  'C-倒垃圾',
  'D-洗手台',
  'E-浴室',
  'F-阳台',
])
check(
  '6 人 5 项：每人至少一项',
  six.every((m) => slots6.some((s) => s.memberId === m.id)),
  true,
)
const totals6 = {}
for (let k = 0; k < 6; k += 1) {
  for (const s of buildCycleSlots(six, fiveItems, k)) totals6[s.memberId] = (totals6[s.memberId] || 0) + 1
}
check('6 人 5 项：6 轮累计后人人相等', Object.values(totals6).sort(), [6, 6, 6, 6, 6, 6])

// ---- 用例 5：周期计算 ----
check('开始日期当天属于第 0 轮', cycleIndexOf('2026-09-07', '2026-09-07', 7), 0)
check('第 7 天属于第 1 轮', cycleIndexOf('2026-09-14', '2026-09-07', 7), 1)
check('前一天仍属第 0 轮', cycleIndexOf('2026-09-13', '2026-09-07', 7), 0)
check('周期不足时也按实际算', cycleIndexOf('2026-09-25', '2026-09-07', 7), 2)
check('周期起止日期', cycleRange('2026-09-07', 7, 2), { start: '2026-09-21', end: '2026-09-27' })
check('自定义周期 5 天', cycleRange('2026-09-07', 5, 1), { start: '2026-09-12', end: '2026-09-16' })

// ---- 用例 6：「从此以后改轮换基线」的反推 ----
const editedCycle1 = [
  { memberId: '甲', dutyItemId: '阳台', isManual: true, note: null },
  { memberId: '乙', dutyItemId: '地面', isManual: true, note: null },
  { memberId: '丙', dutyItemId: '倒垃圾', isManual: true, note: null },
]
const baseline = deriveBaseline(three, it3, 1, editedCycle1)
check('反推出的新基线', baseline, ['乙', '丙', '甲'])
const reordered = reorderBy(three, baseline)
check('用新基线跑第 1 轮，结果与用户编辑一致', pairOf(buildCycleSlots(reordered, it3, 1)), [
  '甲-阳台',
  '乙-地面',
  '丙-倒垃圾',
])
check('用新基线跑第 0 轮（历史那轮不受影响）', pairOf(buildCycleSlots(reordered, it3, 0)), [
  '乙-阳台',
  '丙-地面',
  '甲-倒垃圾',
])

// ---- 用例 7：rotateRight 基本性质 ----
check('右移一位', rotateRight(['甲', '乙', '丙'], 1), ['丙', '甲', '乙'])
check('右移零位保持不变', rotateRight(['甲', '乙', '丙'], 0), ['甲', '乙', '丙'])
check('右移位数超过长度也能正确取模', rotateRight(['甲', '乙', '丙'], 4), ['丙', '甲', '乙'])
check('空数组不崩', rotateRight([], 3), [])

console.log('')
console.log(failed === 0 ? '全部通过 ✅' : failed + ' 项未通过 ❌')
process.exit(failed === 0 ? 0 : 1)
