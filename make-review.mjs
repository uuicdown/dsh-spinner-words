// 生成审核用清单：直接读 client.js 的 BASE_PAIRS，保证与线上一致。
import fs from 'node:fs'

const src = fs.readFileSync(new URL('./client.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const start = src.indexOf('var BASE_PAIRS = [')
const arrayText = src.slice(src.indexOf('=', start) + 1, src.indexOf(';', start))
const pairs = (0, eval)(arrayText)

const SECTION_SIZES = [
  ['一、鲸鱼系 deep（13）', 13],
  ['二、Claude Code spinner verbs（158）', 158],
  ['三、中国本土 · 雅（86）', 86],
  ['四、中国本土 · 俗（30）', 30]
]

const en = (s) => s.charAt(0).toUpperCase() + s.slice(1) + '...'
const zh = (s) => s + '…'

/** Markdown 表格单元格：反斜杠、竖线、换行都要处理，否则会破坏表格结构。 */
const cell = (value) => String(value == null ? '' : value)
  .replace(/\\/g, '\\\\')
  .replace(/\|/g, '\\|')
  .replace(/\r?\n/g, ' ')

const out = []
out.push('# dsh-spinner-words · 词表审核清单')
out.push('')
out.push(`共 **${pairs.length}** 条。第四列「注脚」只在鼠标悬停时显示，不进状态行。`)
out.push('')
out.push('> 改词最快的方式：刷新页面 → **双击状态行**（或 `Alt+E`）打开编辑器，一行一条 `英文 | 中文`。')
out.push('')

let cursor = 0
for (const [title, size] of SECTION_SIZES) {
  const slice = pairs.slice(cursor, cursor + size)
  out.push(`## ${title}`)
  out.push('')
  out.push('| # | 状态行显示（中） | 状态行显示（英） | 注脚 |')
  out.push('| ---: | --- | --- | --- |')
  slice.forEach((p, i) => {
    const n = cursor + i + 1
    out.push(`| ${n} | ${cell(zh(p[1]))} | ${cell(en(p[0]))} | ${cell(p[2])} |`)
  })
  out.push('')
  cursor += size
}

const glossCount = pairs.filter((p) => p[2]).length
out.push('## 统计')
out.push('')
out.push(`- 总条数：${pairs.length}`)
out.push(`- 带注脚：${glossCount}`)
out.push(`- 中文重复：${pairs.length - new Set(pairs.map((p) => p[1])).size}`)
out.push(`- 英文重复：${pairs.length - new Set(pairs.map((p) => p[0])).size}`)
const longest = [...pairs].sort((a, b) => en(b[0]).length - en(a[0]).length)[0]
out.push(`- 最长英文：${en(longest[0])}（${en(longest[0]).length} 字符）`)
const longestZh = [...pairs].sort((a, b) => zh(b[1]).length - zh(a[1]).length)[0]
out.push(`- 最长中文：${zh(longestZh[1])}（${zh(longestZh[1]).length} 字）`)
out.push('')

fs.writeFileSync(new URL('./REVIEW.md', import.meta.url), out.join('\n'), 'utf8')
console.log(`写出 REVIEW.md：${pairs.length} 条，注脚 ${glossCount} 条`)
