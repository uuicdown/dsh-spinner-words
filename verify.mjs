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
// 只允许 require React（设置页开关需要），其余依赖一律不许引入
const factoryBody = src.split('factory: (require) =>')[1] || ''
const requiredIds = [...factoryBody.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1])
assert.deepStrictEqual(requiredIds, ['react'], `factory 内只允许 require("react")，实际：${requiredIds.join(', ') || '无'}`)
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
assert.ok(src.includes('keydown'), '必须有键盘快捷键入口（不依赖点击冒泡，Alt+E 打开词池编辑器）')
assert.ok(src.includes('__dshSpinnerWordsEditor'), '必须暴露控制台兜底入口 window.__dshSpinnerWordsEditor()')
assert.ok(src.includes('characterData: true'), '必须订阅 characterData，否则 React 每秒回写文本时我们收不到通知（会闪回内置文案）')
assert.ok(src.includes('"characterData"'), 'onMutate 里必须处理 characterData mutation')
assert.ok(!src.includes('@keyframes dsw-'), '不应再注入任何自定义动画（用户要求全部关掉）')
assert.ok(!src.includes('data-dsh-words-motion'), '不应再往吉祥物写动画属性')
assert.ok(pkg.dsh?.client?.platform === 'web', 'package.json 必须声明 dsh.client.platform = web')
assert.ok(pkg.exports?.['./client'], 'package.json 必须有 exports["./client"]')
ok('bundle 包裹 / 模块 id / 锚点 / 属性改写 / 守卫 / 默认中文 / 清单声明')

// ---------------------------------------------------------------- 词池数据
console.log('词池数据')
const start = src.indexOf('var BASE_PAIRS = [')
const end = src.indexOf('\n\t\t];', start)
assert.ok(start > 0 && end > start, 'PAIRS 数组必须存在')
const arrayText = src.slice(src.indexOf('=', start) + 1, src.indexOf(';', start))
const PAIRS = vm.runInNewContext('(' + arrayText + ')')
assert.ok(Array.isArray(PAIRS) && PAIRS.length > 200, `词池要大：实际 ${PAIRS.length} 条`)

const seenEn = new Set()
const seenZh = new Set()
for (const pair of PAIRS) {
  assert.ok(Array.isArray(pair) && (pair.length === 2 || pair.length === 3),
    `词条必须是 [en, zh] 或 [en, zh, gloss]：${JSON.stringify(pair)}`)
  const [en, zh, gloss] = pair
  assert.ok(typeof en === 'string' && en.trim().length > 0, `英文不能为空：${JSON.stringify(pair)}`)
  assert.ok(typeof zh === 'string' && zh.trim().length > 0, `中文不能为空：${JSON.stringify(pair)}`)
  if (pair.length === 3) {
    assert.ok(typeof gloss === 'string' && gloss.trim().length > 0, `注脚不能是空串：${JSON.stringify(pair)}`)
  }
  assert.strictEqual(en.charAt(0), en.charAt(0).toLowerCase(), `英文首字母必须小写（展示时自动大写）：${en}`)
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

/** 一个运行状态行容器，按 TextShimmer 的真实结构搭：
 *   div[data-chat-running]
 *     span[role=status].visuallyHidden > 文本节点
 *     span.runningContent > span.root[data-shimmer]
 *        span.content > span.text > 【文本节点】      ← Provider=false：底层文字是文本节点
 *        span.decoration > span.sweep > span.content.highlight
 *                                      > span.text[data-shimmer-text] ← Provider=true：属性渲染
 *   同一句话两处载体：底层文本节点 + 高光层属性。只改一层就会叠字。 */
function host(text) {
  const baseText = textNode(text)
  const a11yText = textNode(text)
  const highlight = {
    nodeType: 1,
    attrs: { 'data-shimmer-text': text },
    writes: 0,
    getAttribute(name) { return name in this.attrs ? this.attrs[name] : null },
    setAttribute(name, value) { this.attrs[name] = value; this.writes++ }
  }
  const textSpan = { nodeType: 1, childNodes: [baseText] }
  const content = { nodeType: 1, childNodes: [textSpan] }
  const root = { nodeType: 1, childNodes: [content] }
  const runningContent = { nodeType: 1, childNodes: [root] }
  const a11y = { nodeType: 1, childNodes: [a11yText] }
  const iconEl = {
    nodeType: 1,
    attrs: {},
    getAttribute(name) { return name in this.attrs ? this.attrs[name] : null },
    setAttribute(name, value) { this.attrs[name] = value }
  }
  const highlightSpan = { nodeType: 1, childNodes: [highlight] }
  const sweep = { nodeType: 1, childNodes: [highlightSpan] }
  const decoration = { nodeType: 1, childNodes: [sweep] }
  const elements = [a11y, runningContent, root, content, textSpan, decoration, sweep, highlightSpan, highlight]
  const listeners = {}
  return {
    nodeType: 1,
    style: {},
    title: '',
    childNodes: [a11y, runningContent, decoration],
    getAttribute: (name) => (name === 'data-chat-running' ? '' : null),
    hasAttribute: (name) => name === 'data-chat-running',
    querySelector: (sel) => {
      if (sel === '[data-shimmer-text]') return highlight
      if (sel === '[role="status"]') return a11y
      if (sel === '[class*="runningIcon"]') return iconEl
      return null
    },
    querySelectorAll: (sel) => {
      if (sel === '[data-shimmer-text]') return [highlight]
      if (sel === '*') return elements
      return []
    },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn) },
    fire(type) { (listeners[type] || []).forEach((fn) => fn()) },
    _shimmer: highlight,
    _base: baseText,
    _a11y: a11y,
    _icon: iconEl,
    icon() { return iconEl.attrs['data-dsh-words-motion'] || '' },
    label() { return baseText.data },
    highlightLabel() { return highlight.attrs['data-shimmer-text'] },
    a11yLabel() { return a11yText.data },
    relabel(v) {
      baseText.data = v
      highlight.attrs['data-shimmer-text'] = v
      a11yText.data = v
    }
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

const docListeners = {}

const context = {
  console,
  Promise,
  Date: { now: () => clock },
  // 不能同步执行 fn：节流补切的 scheduleRelease 会自己重排，同步跑会无限递归。
  setTimeout: () => 0,
  setInterval: (fn) => { maintainFn = fn; return 0 },
  clearInterval: () => {},
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v }
  },
  MutationObserver: class {
    constructor(cb) { observerCb = cb }
    observe() {}
    disconnect() {}
  },
  document: {
    body: {},
    head: { appendChild() {} },
    querySelector: () => null,
    createElement: () => ({ setAttribute() {}, textContent: '', appendChild() {} }),
    querySelectorAll: (sel) => (sel === '[data-chat-running]' ? hosts.slice() : []),
    addEventListener(type, fn) { (docListeners[type] ||= []).push(fn) },
    removeEventListener(type, fn) {
      const list = docListeners[type] || []
      const i = list.indexOf(fn)
      if (i >= 0) list.splice(i, 1)
    }
  }
}

/** 触发 document 捕获阶段的点击（模拟真实点击，不经过元素上的监听） */
function docClick(target, opts = {}) {
  const ev = {
    target,
    altKey: !!opts.altKey,
    metaKey: false,
    preventDefault() {},
    stopPropagation() {}
  }
  ;(docListeners.click || []).forEach((fn) => fn(ev))
}
context.window = {
  localStorage: context.localStorage,
  __ModuleLoader__: {
    load: ({ factory }) => {
      context.__exports = factory((id) => {
        if (id === 'react') return { useState: (v) => [v, () => {}], createElement: () => ({}) }
        throw new Error('不得 require: ' + id)
      })
    }
  }
}
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
assert.strictEqual(status.a11yLabel(), status.label(), '读屏用的 role=status 文本必须同步')
assert.ok(status.title.includes('切换为 English') && status.title.includes('Alt'), '认领后应挂上"切换语言 + 编辑词池"提示')
assert.strictEqual(status.style.cursor, 'pointer', '认领后应可点击')
const zhLabel = status.label()
assert.ok(status.icon() === '', '不应再给吉祥物加自定义动作（用内置游动即可）')
assert.strictEqual(status.highlightLabel(), zhLabel, '高光层的 data-shimmer-text 属性必须同步')
ok(`认领成功，底层文本 + 高光属性 两处一致：${zhLabel}`)

status.fire('click')
assert.match(status.label(), /^[A-Z].*\.\.\.$/, `点击后应显示英文短语，实际 "${status.label()}"`)
assert.strictEqual(store['dsh-spinner-words:lang'], 'en', '语言选择必须写进 localStorage')
ok(`点击切英文：${status.label()}（同一条短语只换语言）`)

status.fire('click')
assert.strictEqual(status.label(), zhLabel, '再点一次应回到同一条中文短语')
ok('再点一次回到同一条中文短语（不重新抽取）')

// document 捕获阶段的路径：状态行内部若 stopPropagation，元素上的监听收不到事件，
// 所以真正的点击由 start() 里挂在 document 捕获阶段的监听接管。
const docBefore = status.label()
docClick(status)
assert.notStrictEqual(status.label(), docBefore, 'document 捕获阶段的点击必须生效（不依赖冒泡）')
docClick(status) // 复位回原语言
assert.strictEqual(status.label(), docBefore, '再点一次应复位')
ok('document 捕获阶段点击生效（行组件 stopPropagation 也不影响）')

// ---------------------------------------------------------------- 节奏（一回合一个词）
console.log('轮换节奏')
const turnLabel = status.label()
for (let i = 0; i < 20; i++) {
  clock += 5000
  observerCb([{ addedNodes: [row('assistant-step')] }])
  await micro()
  observerCb([{ addedNodes: [row('tool-call')] }])
  await micro()
}
assert.strictEqual(status.label(), turnLabel, '默认节奏「一回合一个词」：回合内 20 次事件都不换词（对齐 Claude Code）')
ok('回合内 20 次思考/工具事件都不换词')

// ---------------------------------------------------------------- 防写入风暴
console.log('防写入风暴')
status._shimmer.writes = 0
status._base.setWrites(0)
status._a11y.childNodes[0].setWrites(0)
maintainFn()
maintainFn()
maintainFn()
assert.strictEqual(status._shimmer.writes, 0, `文案未变时维护扫描不得写属性，实际写了 ${status._shimmer.writes} 次`)
assert.strictEqual(status._base.writes, 0, '文案未变时不得重写底层文本节点')
assert.strictEqual(status._a11y.childNodes[0].writes, 0, '文案未变时不得重写读屏文本节点')
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

// 实时兜底：React 改动文本节点会立刻产生 characterData mutation，
// 不应该等 3 秒维护扫描（否则用户会看到闪回内置文案）。
const liveHost = host('深度求索中')
liveHost._base.parentNode = liveHost // 让 hostOf() 能向上找到容器（真实 DOM 里本来就有）
hosts = [liveHost]
observerCb([{ addedNodes: [liveHost] }])
await micro()
const liveLabel = liveHost.label()
liveHost._base.data = '深度求索中，用时 20s ···' // React 写入
observerCb([{ type: 'characterData', target: liveHost._base, addedNodes: [] }])
await micro()
assert.strictEqual(liveHost.label(), liveLabel, '文本节点被 React 改写后必须立刻恢复，不能等维护扫描')
ok('characterData 实时恢复（无闪回窗口）')

// 隐藏行（holding）不该被当成新回合
const holdingHost = host('深度求索中')
holdingHost.hasAttribute = (name) => name === 'data-chat-running' || name === 'data-holding'
hosts = [timed, holdingHost]
observerCb([{ addedNodes: [holdingHost] }])
await micro()
assert.strictEqual(holdingHost.label(), '深度求索中', 'holding（已结束/隐藏）行不该被认领')
ok('holding 行不被认领')

console.log('新回合')
hosts = []                                  // 上一回合的状态行卸载
observerCb([{ addedNodes: [] }])
await micro()
const next = host('深度求索中')             // 新回合挂载一行内置文案
hosts = [next]
observerCb([{ addedNodes: [next] }])
await micro()
assert.match(next.label(), /…$/, '新回合必须重新认领')
assert.notStrictEqual(next.label(), turnLabel, '新回合应抽到不同的一条')
ok(`新回合换词：${turnLabel} → ${next.label()}`)

// 上一回合的行以 holding（占位）形式留在 DOM 里时，新回合仍必须换词
const prev = host('深度求索中')
hosts = [prev]
observerCb([{ addedNodes: [prev] }])
await micro()
const prevLabel = prev.label()
prev.hasAttribute = (name) => name === 'data-chat-running' || name === 'data-holding'
const fresh = host('深度求索中')
hosts = [prev, fresh]
observerCb([{ addedNodes: [fresh] }])
await micro()
assert.notStrictEqual(fresh.label(), prevLabel, '上一回合的 holding 行不能让新回合沿用旧词')
ok(`holding 占位仍在时，新回合照样换词：${prevLabel} → ${fresh.label()}`)

assert.ok(src.includes('var ROTATE_MS = 0;'), '默认必须是「一回合一个词」（ROTATE_MS = 0）')
ok('默认 ROTATE_MS = 0（想慢速轮换可自行改成毫秒数）')

console.log('自定义词池')
store['dsh-spinner-words:custom'] = JSON.stringify([['alpha thing', '甲中', '甲注脚']])
hosts = []                                   // 结束上一回合
observerCb([{ addedNodes: [] }])
await micro()
const custom = host('深度求索中')            // 新回合开场必须从自定义池里抽
hosts = [custom]
observerCb([{ addedNodes: [custom] }])
await micro()
assert.ok(['甲中…'].includes(custom.label()), `自定义词池必须生效，实际 "${custom.label()}"`)
custom.fire('click')
assert.ok(['Alpha thing...'].includes(custom.label()), `自定义词池的英文侧必须对应，实际 "${custom.label()}"`)
assert.ok(custom.title.includes('注脚'), `词条第三项必须作为 hover 注解出现在 title 里，实际 "${custom.title}"`)
ok(`自定义词池生效（含 hover 注解）：${custom.label()}`)
delete store['dsh-spinner-words:custom']

console.log('词池解析')
const parsed = bundle.parsePool ? bundle.parsePool('# 注释\n\nalpha | 甲\nbeta | 乙\n只有中文\n') : null
assert.ok(Array.isArray(parsed), 'bundle 必须导出 parsePool 供测试与编辑器复用')
assert.strictEqual(parsed.length, 3, `应解析出 3 条（跳过注释与空行），实际 ${parsed.length}`)
assert.strictEqual(JSON.stringify(parsed[0]), JSON.stringify(['alpha', '甲']))
assert.strictEqual(JSON.stringify(parsed[2]), JSON.stringify(['只有中文', '只有中文']), '只有一侧时两侧都用同一串')
ok('parsePool：跳过注释空行、单侧兜底')


console.log('设置页开关')
assert.ok(src.includes('settings.general.item'), '必须在 DSH 设置页注册开关行')
assert.ok(src.includes('dsh-spinner-words:paused'), '暂停状态要持久化到 localStorage')

const injected = []
const registered = []
const fakeCtx = {
  slots: {
    inject(name, fn) { injected.push(name); fn() },
    register(cfg, comp) { registered.push({ cfg, comp }); return { id: cfg.id } }
  }
}
bundle.apply(fakeCtx)
assert.ok(injected.indexOf('settings.general.item') >= 0, '应注册到 settings.general.item 槽位')
assert.strictEqual(registered[0].cfg.id, 'dsh-spinner-words', '注册项 id 必须是包名')
ok('设置页开关注册成功（id、槽位、组件）')

// 暂停后不再接管状态行
context.localStorage.setItem('dsh-spinner-words:paused', '1')
const p1 = host('深度求索中')
hosts = [p1]
observerCb([{ addedNodes: [p1] }])
await micro()
assert.strictEqual(p1.label(), '深度求索中', '暂停时不得改写状态行')
context.localStorage.setItem('dsh-spinner-words:paused', '0')
context.localStorage.getItem && context.localStorage.setItem('dsh-spinner-words:paused', '')
ok('暂停态生效：状态行保持内置文案')

console.log('节流有效性')
// 对照实验：页面上留着 holding 占位行（DSH 每轮结束后的常态）时，
// 节流窗口必须仍然生效。旧实现用 tracked 判断「有没有未认领的新行」，
// 而 holding 行永远不进 tracked，导致 fresh 恒为真、每次变更都全量扫。
let hostQueries = 0
const rawQSA = context.document.querySelectorAll
context.document.querySelectorAll = (sel) => {
  if (sel === '[data-chat-running]') hostQueries++
  return rawQSA(sel)
}
const holdRow = host('深度求索中')
holdRow.hasAttribute = (n) => n === 'data-chat-running' || n === 'data-holding'
hosts = [holdRow]
observerCb([{ addedNodes: [holdRow] }])
await micro()
hostQueries = 0
for (let i = 0; i < 10; i++) {
  observerCb([{ addedNodes: [row('assistant-step')] }])
  await micro()
}
assert.ok(hostQueries <= 2, `holding 行不应让节流失效：10 次变更实际查询 ${hostQueries} 次`)
ok(`节流生效：10 次变更只查询 ${hostQueries} 次`)

// 节流窗口内出现新容器时仍必须立即认领，不能被延迟 200ms
const freshHost = host('深度求索中')
hosts = [holdRow, freshHost]
observerCb([{ addedNodes: [freshHost] }])
await micro()
assert.ok(/…$|\.\.\.$/.test(freshHost.label()), `新容器必须立即认领，不受节流延迟（实际 "${freshHost.label()}"）`)
ok('新容器立即认领（节流不延迟回合开场）')
context.document.querySelectorAll = rawQSA

console.log('生命周期')
assert.ok(typeof bundle.teardown === 'function', 'bundle 必须导出 teardown()')
assert.ok(src.includes('__dshSpinnerWordsInstance'), '必须有实例守卫，重复 apply 时先拆旧实例')

const clicksBefore = (docListeners.click || []).length
assert.strictEqual(clicksBefore, 1, `首次 apply 后应只有一套 document click 监听，实际 ${clicksBefore}`)
bundle.apply()
const clicksAfter = (docListeners.click || []).length
assert.strictEqual(clicksAfter, clicksBefore, '重复 apply 必须先拆除旧实例，不能叠加 document 监听')
ok('重复 apply 不叠加监听（旧实例被 teardown）')

assert.ok(src.includes('e.repeat'), 'Alt+E 必须过滤长按重复事件')
assert.ok(src.includes('SWEEP_MS'), 'sweep 必须有节流')
assert.ok(!/addEventListener\("dblclick"[\s\S]{0,220}?preventDefault\(\)/.test(src), 'dblclick 不可取消，不应调 preventDefault()')
ok('长按重复 / sweep 节流 / dblclick 误用 preventDefault 三处已修正')

console.log(`
全部通过：${passed} 项检查`)
