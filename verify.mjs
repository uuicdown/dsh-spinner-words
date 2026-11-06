// dsh-spinner-words: 自测（node verify.mjs）。
//
// 用 node:vm + 极简 DOM shim 驱动真实的 client.js bundle，不需要浏览器：
//   - 数据不变量：词池分段条数、英中成对、中文串不重复、英文不重复；
//   - 静态契约：__ModuleLoader__ 包裹、模块 id = 包名、内置文案锚点、同值不写守卫、默认中文；
//   - 行为：认领状态行 → 显示中文短语；点击 → 切英文且同一条短语不换词；
//   - 行为：每个新 assistant-step 行换一条，且连续两条不相同；
//   - 行为：3 秒保底节流——窗口内的事件不立刻换词；
//   - 行为：维护扫描在文案未变时不再写 DOM（防 characterData 微任务风暴）。
import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert'

const here = new URL('.', import.meta.url)
const src = fs.readFileSync(new URL('./client.js', here), 'utf8')
const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', here), 'utf8'))

let passed = 0
function ok(label) {
  passed++
  console.log(`  ok  ${label}`)
}
async function micro() {
  // 让 bundle 里的 Promise.resolve().then 回调跑完
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

// ---------------------------------------------------------------- 静态契约
console.log('静态契约')
assert.ok(src.includes('window.__ModuleLoader__.load({'), 'bundle 必须用 __ModuleLoader__.load 包裹')
assert.ok(src.includes(`id: "${pkg.name}"`), `模块 id 必须等于包名 ${pkg.name}`)
assert.ok(!/\brequire\s*\(/.test(src.split('factory: (require) =>')[1] || ''), 'factory 内不得真的调用 require')
assert.ok(src.includes('var ANCHORS = ["Deep diving...", "Deep diving…"];'), '三个点与省略号两种锚点写法都必须存在')
assert.ok(src.includes('first.data === label'), 'setText 同值不写守卫必须存在')
assert.ok(src.includes('lang = "zh"'), '默认语言必须是中文')
assert.ok(pkg.dsh?.bundle?.patch, 'package.json 必须声明 dsh.bundle.patch')
assert.ok(pkg.dsh?.client?.platform === 'web', 'package.json 必须声明 dsh.client.platform = web')
assert.ok(pkg.exports?.['./client'], 'package.json 必须有 exports["./client"]')
ok('bundle 包裹 / 模块 id / 锚点 / 守卫 / 默认中文 / 清单声明')

// ---------------------------------------------------------------- 词池数据
console.log('词池数据')
const start = src.indexOf('var PAIRS = [')
const end = src.indexOf('\n\t\t];', start)
assert.ok(start > 0 && end > start, 'PAIRS 数组必须存在')
// 从赋值号后切到分号前：结尾正好是 ']'（别用 end+1，那是换行位置，会漏掉 ']'）
const arrayText = src.slice(src.indexOf('=', start) + 1, src.indexOf(';', start))
const PAIRS = vm.runInNewContext('(' + arrayText + ')')
assert.ok(Array.isArray(PAIRS) && PAIRS.length > 200, `词池要大：实际 ${PAIRS.length} 条`)

const seenEn = new Set()
const seenZh = new Set()
for (const pair of PAIRS) {
  assert.ok(Array.isArray(pair) && pair.length === 2, `词条必须是 [en, zh] 二元组：${JSON.stringify(pair)}`)
  const [en, zh] = pair
  assert.ok(typeof en === 'string' && en.trim().length > 0, `英文不能为空：${JSON.stringify(pair)}`)
  assert.ok(typeof zh === 'string' && zh.trim().length > 0, `中文不能为空：${JSON.stringify(pair)}`)
  assert.ok(en === en.toLowerCase(), `英文必须存小写（展示时首字母大写）：${en}`)
  assert.ok(!/\.\.\./.test(en), `英文不要带省略号（展示时自动加）：${en}`)
  assert.ok(!/…/.test(zh), `中文不要带省略号（展示时自动加）：${zh}`)
  assert.ok(!seenEn.has(en), `英文重复：${en}`)
  assert.ok(!seenZh.has(zh), `中文重复：${zh}（两条不同英文共用同一中文会显得重复）`)
  seenEn.add(en)
  seenZh.add(zh)
}
ok(`${PAIRS.length} 条成对、英文不重复、中文不重复、无自带省略号`)

// 分段条数：按源码里的 ======== 小节标记切
const marks = [...src.matchAll(/\/\/ ={8} \d\. .*?={8}/g)].map((m) => m.index)
assert.ok(marks.length === 4, `词池必须分 4 段，实际 ${marks.length} 段`)
const sections = marks.map((at, i) => {
  const slice = src.slice(at, i + 1 < marks.length ? marks[i + 1] : end)
  return (slice.match(/\n\t\t\t\["/g) || []).length
})
const [whale, cc, ya, su] = sections
assert.deepStrictEqual(whale, 13, `鲸鱼系应 13 条，实际 ${whale}`)
assert.ok(cc >= 150 && cc <= 179, `Claude Code 段应在 150-179 条之间，实际 ${cc}`)
assert.ok(su === 30, `俗段应 30 条，实际 ${su}`)
assert.ok(ya >= su * 2, `雅七俗三：雅(${ya}) 至少是俗(${su}) 的两倍`)
assert.strictEqual(whale + cc + ya + su, PAIRS.length, '分段条数之和必须等于总数')
ok(`分段：鲸鱼 ${whale} + Claude Code ${cc} + 雅 ${ya} + 俗 ${su} = ${PAIRS.length}`)

// ---------------------------------------------------------------- 运行环境 shim
function textNode(data) {
  let value = data
  let writes = 0
  return {
    nodeType: 3,
    get data() { return value },
    set data(v) { value = v; writes++ },
    get writes() { return writes },
    setWrites(n) { writes = n }
  }
}

function el({ kind = null, text = '' } = {}) {
  const node = textNode(text)
  const listeners = {}
  const e = {
    nodeType: 1,
    firstChild: node,
    style: {},
    title: '',
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn) },
    fire(type) { (listeners[type] || []).forEach((fn) => fn()) },
    hasAttribute: (name) => kind !== null && name === 'data-chat-flow-kind',
    getAttribute: (name) => (name === 'data-chat-flow-kind' ? kind : null),
    querySelectorAll: () => []
  }
  return e
}

let clock = 1_000_000
let statusEls = []
let observerCb = null
let maintainFn = null
let store = {}

const context = {
  console,
  Promise,
  Date: { now: () => clock },
  // 不能同步执行 fn：节流补切的 scheduleRelease 会自己重排，同步跑会无限递归。
  // 真实环境里补切由 maintain()/定时器驱动，测试里用 maintainFn() 手动触发。
  setTimeout: () => 0,
  setInterval: (fn) => { maintainFn = fn; return 0 },
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v }
  },
  MutationObserver: class {
    constructor(cb) { observerCb = cb }
    observe() {}
  },
  document: {
    body: {},
    querySelectorAll: (sel) => (sel === 'div[role="status"]' ? statusEls.slice() : []),
    addEventListener() {}
  }
}
context.window = { __ModuleLoader__: { load: ({ factory }) => { context.__exports = factory(() => { throw new Error('不得 require') }) } } }
context.globalThis = context
vm.createContext(context)
vm.runInContext(src, context)

const bundle = context.__exports
assert.ok(bundle && typeof bundle.apply === 'function', 'bundle 必须导出 apply()')
bundle.apply()
ok('bundle 在 vm 里加载并 apply()（无 require、无浏览器依赖）')

// ---------------------------------------------------------------- 认领与语言
console.log('认领与语言')
const status = el({ text: 'Deep diving...' })
statusEls = [status]
observerCb([{ addedNodes: [status] }])
await micro()

assert.match(status.firstChild.data, /…$/, `默认必须显示中文短语，实际 "${status.firstChild.data}"`)
assert.ok(status.firstChild.data !== 'Deep diving...', '必须已被插件认领')
assert.strictEqual(status.title, '点击切换为 English', '认领后应挂上可点击提示')
assert.strictEqual(status.style.cursor, 'pointer', '认领后应可点击')
const zhLabel = status.firstChild.data
ok(`认领成功，显示中文：${zhLabel}`)

status.fire('click')
assert.match(status.firstChild.data, /^[A-Z].*\.\.\.$/, `点击后应显示英文短语，实际 "${status.firstChild.data}"`)
assert.strictEqual(store['dsh-spinner-words:lang'], 'en', '语言选择必须写进 localStorage')
ok(`点击切英文：${status.firstChild.data}（同一条短语只换语言）`)

status.fire('click')
assert.strictEqual(status.firstChild.data, zhLabel, '再点一次应回到同一条中文短语')
ok('再点一次回到同一条中文短语（不重新抽取）')

// ---------------------------------------------------------------- 轮换与节流
console.log('轮换与节流')
const labels = [status.firstChild.data]
for (let i = 0; i < 30; i++) {
  clock += 3100
  const row = el({ kind: 'assistant-step' })
  observerCb([{ addedNodes: [row] }])
  await micro()
  labels.push(status.firstChild.data)
}
for (let i = 1; i < labels.length; i++) {
  assert.notStrictEqual(labels[i], labels[i - 1], `连续两条不能相同：${labels[i - 1]}`)
}
assert.ok(new Set(labels).size > 20, `31 次轮换应出现足够多样的短语，实际 ${new Set(labels).size} 种`)
ok(`31 次轮换无连续重复，共 ${new Set(labels).size} 种`)

const before = status.firstChild.data
clock += 500 // 落在 3 秒窗口内
const row2 = el({ kind: 'tool-call' })
observerCb([{ addedNodes: [row2] }])
await micro()
assert.strictEqual(status.firstChild.data, before, '窗口内（<3s）的事件不得立刻换词')
ok('3 秒保底节流生效')

// ---------------------------------------------------------------- 防写入风暴
console.log('防写入风暴')
status.firstChild.setWrites(0)
maintainFn()
maintainFn()
maintainFn()
assert.strictEqual(status.firstChild.writes, 0, `文案未变时维护扫描不得写 DOM，实际写了 ${status.firstChild.writes} 次`)
ok('维护扫描在文案未变时零写入（同值不写守卫生效）')

// 非思考状态行不得被碰
const other = el({ text: '12s' })
statusEls = [status, other]
const otherBefore = other.firstChild.data
observerCb([{ addedNodes: [other] }])
await micro()
assert.strictEqual(other.firstChild.data, otherBefore, '不认识的 role=status 元素不得被改写')
ok('别的 role=status 元素不受影响')

// ---------------------------------------------------------------- 锚点写法兼容
console.log('锚点写法兼容')
// 内置文案可能写成三个点，也可能写成单个省略号字符（U+2026）；
// 只认一种的话，DSH 换写法时插件会静默 no-op，且用户看不出来。
const ellipsis = el({ text: 'Deep diving…' })
statusEls = [ellipsis]
observerCb([{ addedNodes: [ellipsis] }])
await micro()
assert.match(ellipsis.firstChild.data, /…$/, `省略号形式的锚点也必须被认领，实际 "${ellipsis.firstChild.data}"`)
assert.notStrictEqual(ellipsis.firstChild.data, 'Deep diving…', '省略号形式必须被改写，而不是原样留着')
ok('"Deep diving…"（U+2026）形式也被认领')

const unrelated = el({ text: 'Loading assets...' })
statusEls = [unrelated]
observerCb([{ addedNodes: [unrelated] }])
await micro()
assert.strictEqual(unrelated.firstChild.data, 'Loading assets...', '长得像但不是锚点的状态文本不得被改写')
ok('近似文本不被误认领')

console.log(`\n全部通过：${passed} 项检查`)
