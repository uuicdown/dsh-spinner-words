// dsh-spinner-words: 自测（node verify.mjs）。
//
// 用 node:vm + 极简 DOM shim 驱动真实的 client.js bundle，不需要浏览器。
//
// 关键事实（从 DSH 安装包 app.asar 的 RunningStatus 源码读出，v0.1.3 起按此实现）：
//   运行状态行的可见文案不是文本节点，而是一个属性：
//     <div data-chat-running>
//       <span role="status" aria-live="polite" class="…visuallyHidden">深度求索中</span>  ← 只给读屏
//       <span class="…runningDivider" aria-hidden="true"/>
//       <span class="…runningContent"><WhaleTail/><span data-shimmer-text="深度求索中…">…</span></span>
//     </div>
//   可见文字由 CSS `::after { content: attr(data-shimmer-text) }` 画出，DOM 里没有对应文本节点。
//   所以插件必须写 data-shimmer-text 属性，写文本节点永远看不见。
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
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

// ---------------------------------------------------------------- 静态契约
console.log('静态契约')
assert.ok(src.includes('window.__ModuleLoader__.load({'), 'bundle 必须用 __ModuleLoader__.load 包裹')
assert.ok(src.includes(`id: "${pkg.name}"`), `模块 id 必须等于包名 ${pkg.name}`)
assert.ok(!/\brequire\s*\(/.test(src.split('factory: (require) =>')[1] || ''), 'factory 内不得真的调用 require')
assert.ok(src.includes('"深度求索中"'), '必须认领中文 locale 的内置文案「深度求索中」')
assert.ok(src.includes('"Deep diving"'), '必须认领英文 locale 的内置文案 "Deep diving"')
assert.ok(src.includes('[data-chat-running]'), '必须按容器属性 data-chat-running 定位状态行')
assert.ok(src.includes('data-shimmer-text'), '必须改写 data-shimmer-text 属性（可见文案由它驱动）')
assert.ok(
  src.includes('getAttribute("data-shimmer-text") !== label') && src.includes('first.data !== label'),
  'setText 同值不写守卫必须存在'
)
assert.ok(src.includes('lang = "zh"'), '默认语言必须是中文')
assert.ok(pkg.dsh?.bundle?.patch, 'package.json 必须声明 dsh.bundle.patch')
assert.ok(src.includes('__dshSpinnerWords'), '必须有可观测的加载标记 __dshSpinnerWords（区分"没加载"与"没认领"）')
assert.ok(pkg.dsh?.client?.platform === 'web', 'package.json 必须声明 dsh.client.platform = web')
assert.ok(pkg.exports?.['./client'], 'package.json 必须有 exports["./client"]')
ok('bundle 包裹 / 模块 id / 锚点 / 属性改写 / 守卫 / 默认中文 / 清单声明')

// ---------------------------------------------------------------- 词池数据
console.log('词池数据')
const start = src.indexOf('var PAIRS = [')
const end = src.indexOf('\n\t\t];', start)
assert.ok(start > 0 && end > start, 'PAIRS 数组必须存在')
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

/** 一个运行状态行容器：<div data-chat-running> … [data-shimmer-text] … [role=status] … </div> */
function host(text) {
  const shimmer = {
    nodeType: 1,
    attrs: { 'data-shimmer-text': text },
    writes: 0,
    getAttribute(name) { return name in this.attrs ? this.attrs[name] : null },
    setAttribute(name, value) { this.attrs[name] = value; this.writes++ }
  }
  const a11y = { nodeType: 1, firstChild: textNode(text) }
  const listeners = {}
  return {
    nodeType: 1,
    style: {},
    title: '',
    getAttribute: (name) => (name === 'data-chat-running' ? '' : null),
    hasAttribute: (name) => name === 'data-chat-running',
    querySelector: (sel) => (sel === '[data-shimmer-text]' ? shimmer : sel === '[role="status"]' ? a11y : null),
    querySelectorAll: () => [],
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn) },
    fire(type) { (listeners[type] || []).forEach((fn) => fn()) },
    _shimmer: shimmer,
    _a11y: a11y,
    label() { return shimmer.attrs['data-shimmer-text'] },
    relabel(v) { shimmer.attrs['data-shimmer-text'] = v }
  }
}

/** 一个不含状态行的普通对话行（只用来触发轮换事件） */
function row(kind) {
  return {
    nodeType: 1,
    hasAttribute: (name) => name === 'data-chat-flow-kind',
    getAttribute: (name) => (name === 'data-chat-flow-kind' ? kind : null),
    querySelectorAll: () => []
  }
}

let clock = 1_000_000
let hosts = []
let observerCb = null
let maintainFn = null
const store = {}

const context = {
  console,
  Promise,
  Date: { now: () => clock },
  // 不能同步执行 fn：节流补切的 scheduleRelease 会自己重排，同步跑会无限递归。
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
    querySelectorAll: (sel) => (sel === '[data-chat-running]' ? hosts.slice() : []),
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
const status = host('深度求索中')
hosts = [status]
observerCb([{ addedNodes: [status] }])
await micro()

assert.match(status.label(), /…$/, `默认必须显示中文短语，实际 "${status.label()}"`)
assert.notStrictEqual(status.label(), '深度求索中', '必须已被插件认领（属性被改写）')
assert.strictEqual(status._a11y.firstChild.data, status.label(), '读屏用的 role=status 文本必须同步')
assert.strictEqual(status.title, '点击切换为 English', '认领后应挂上可点击提示')
assert.strictEqual(status.style.cursor, 'pointer', '认领后应可点击')
const zhLabel = status.label()
ok(`认领成功，改写属性显示中文：${zhLabel}`)

status.fire('click')
assert.match(status.label(), /^[A-Z].*\.\.\.$/, `点击后应显示英文短语，实际 "${status.label()}"`)
assert.strictEqual(store['dsh-spinner-words:lang'], 'en', '语言选择必须写进 localStorage')
ok(`点击切英文：${status.label()}（同一条短语只换语言）`)

status.fire('click')
assert.strictEqual(status.label(), zhLabel, '再点一次应回到同一条中文短语')
ok('再点一次回到同一条中文短语（不重新抽取）')

// ---------------------------------------------------------------- 轮换与节流
console.log('轮换与节流')
const labels = [status.label()]
for (let i = 0; i < 30; i++) {
  clock += 3100
  observerCb([{ addedNodes: [row('assistant-step')] }])
  await micro()
  labels.push(status.label())
}
for (let i = 1; i < labels.length; i++) {
  assert.notStrictEqual(labels[i], labels[i - 1], `连续两条不能相同：${labels[i - 1]}`)
}
assert.ok(new Set(labels).size > 20, `31 次轮换应出现足够多样的短语，实际 ${new Set(labels).size} 种`)
ok(`31 次轮换无连续重复，共 ${new Set(labels).size} 种`)

const before = status.label()
clock += 500
observerCb([{ addedNodes: [row('tool-call')] }])
await micro()
assert.strictEqual(status.label(), before, '窗口内（<3s）的事件不得立刻换词')
ok('3 秒保底节流生效')

// ---------------------------------------------------------------- 防写入风暴
console.log('防写入风暴')
status._shimmer.writes = 0
status._a11y.firstChild.setWrites(0)
maintainFn()
maintainFn()
maintainFn()
assert.strictEqual(status._shimmer.writes, 0, `文案未变时维护扫描不得写属性，实际写了 ${status._shimmer.writes} 次`)
assert.strictEqual(status._a11y.firstChild.writes, 0, '文案未变时不得重写读屏文本节点')
ok('维护扫描在文案未变时零写入（同值不写守卫生效）')

// ---------------------------------------------------------------- 锚点兼容
console.log('锚点兼容')
const unrelated = host('Loading assets...')
hosts = [unrelated]
observerCb([{ addedNodes: [unrelated] }])
await micro()
assert.strictEqual(unrelated.label(), 'Loading assets...', '长得像但不是锚点的状态文本不得被改写')
ok('近似文本不被误认领')

const english = host('Deep diving')
hosts = [english]
observerCb([{ addedNodes: [english] }])
await micro()
assert.match(english.label(), /…$/, `英文 locale 的 "Deep diving" 也必须被认领，实际 "${english.label()}"`)
ok('"Deep diving" 被认领')

// 真实形态：超过 15 秒后带「用时」的整串
const timed = host('深度求索中，用时 12s ···')
hosts = [timed]
observerCb([{ addedNodes: [timed] }])
await micro()
assert.match(timed.label(), /…$/, `带「用时」的整串也必须被认领，实际 "${timed.label()}"`)
ok('"深度求索中，用时 12s ···" 整串被认领')

const steady = timed.label()
timed.relabel('深度求索中，用时 13s ···') // 模拟 React 每秒回写
maintainFn()
assert.strictEqual(timed.label(), steady, 'React 回写计时后，维护扫描必须恢复当前短语')
ok('React 回写计时后能被恢复')

// 隐藏行（holding）不该被当成新回合
const holdingHost = host('深度求索中')
holdingHost.hasAttribute = (name) => name === 'data-chat-running' || name === 'data-holding'
hosts = [timed, holdingHost]
observerCb([{ addedNodes: [holdingHost] }])
await micro()
assert.strictEqual(holdingHost.label(), '深度求索中', 'holding（已结束/隐藏）行不该被认领')
ok('holding 行不被认领')

console.log(`\n全部通过：${passed} 项检查`)
