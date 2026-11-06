# dsh-spinner-words

> 让 DeepSeek Harness 的思考状态行不再只有一句「深度求索中」。

一个纯前端插件：把状态行的固定文案换成一池子会轮换的双语短语——**Claude Code 原版 spinner 词 + 鲸鱼系 deep 短语 + 中国本土文化词**。不改 DSH 源码，不覆盖任何渲染插槽，装上一个文件即生效。

```diff
- 深度求索中…
+ 凿壁偷光中…      ← 回合开场随机一条，整回合不变
+ Chipping through the wall...   ← 点一下，同一条短语换语言
```

## 它做什么

- **一回合一个词**：每次请求开场从词池里随机抽一条，整个回合保持不变（与 Claude Code 一致）。长时间思考不会被反复换词打扰。
- **中英双语、一一对应**：点击状态行切换语言，换的是同一条短语、不重新抽取，选择记在 `localStorage`，重载后恢复。
- **注脚只给细节**：29 条典故类词带完整英文注脚（如「凿壁偷光」→ boring a hole in the wall to steal a neighbor's lamplight），只在鼠标悬停时显示，不撑状态行。
- **词池可自己改**：双击状态行（或 `Alt+E`）打开编辑器，一行一条增删改，保存后下个回合生效。

## 词池构成（287 条）

| 段 | 条数 | 举例 |
| --- | ---: | --- |
| 鲸鱼系 deep | 13 | `深潜中` / `跃出海面中` / `海底冒泡中` |
| Claude Code spinner verbs | 158 | `正在搭架子` / `正在掂量` / `正在爆炒` |
| 中国本土 · 雅 | 86 | `凿壁偷光中` / `庖丁解牛中` / `一蓑烟雨中` / `正在望月` |
| 中国本土 · 俗 | 30 | `带薪思考中` / `憋大招中` / `已读乱回中` |

完整清单见 [`REVIEW.md`](REVIEW.md)（由 `make-review.mjs` 直接从代码生成，保证与线上一致）。

## 安装

```bash
dsh plugin --profile desktop add dsh-spinner-words
```

也可以直接从仓库装：

```bash
dsh plugin --profile desktop add git+https://github.com/uuicdown/dsh-spinner-words.git
```

安装后**完全退出 DSH 进程**再启动（关窗口不算）。本地开发想直接链目录，用 `install.ps1`。

## 用起来

| 操作 | 效果 |
| --- | --- |
| 单击状态行 | 中文 ⇄ English（同一条短语换语言） |
| 双击状态行 / `Alt+E` | 打开词池编辑器 |
| 控制台 `window.__dshSpinnerWordsEditor()` | 兜底入口 |

## 自定义词池

编辑器里一行一条，格式 `英文 | 中文`，`#` 开头是注释，空行忽略：

```
deep diving | 深潜中
chipping through the wall | 正在凿壁偷光 | boring a hole in the wall for a neighbor's lamplight
只有中文也可以
```

- 第三段可选，是**悬停注脚**，不进状态行。
- 保存写在 `localStorage`（`dsh-spinner-words:custom`），**下一个回合起生效**；「恢复默认」清空覆盖。
- 保存后整份词池以你的版本为准，内置池升级不会自动合并——想拿新词就点「恢复默认」再改一遍。

## 它到底改了什么

DSH 的运行状态行有两处承载文案：底层是**文本节点**，高光扫过层是 **`data-shimmer-text` 属性**（由 CSS `::after` 画出来）。插件两处都写，并同步屏幕阅读器节点；React 每秒把「用时」写回文本时，`characterData` 监听会立刻恢复，不会闪回内置文案。

**不碰视觉细节**：图标、动效、尺寸、颜色一律不动，小鲸鱼保持 DSH 自带的游动。这是刻意的范围限制——文案与交互归插件，视觉归 DSH。

## 兼容与降级

| DSH 若这样改 | 后果 |
| --- | --- |
| 改掉内置文案（当前：中文「深度求索中」/ 英文「Deep diving」） | 插件自动 no-op，不报错、不影响界面 |
| 改掉 `data-chat-running` / `data-shimmer-text` / `data-chat-flow-kind` | 退化为部分生效或完全不生效，界面不坏 |

## 与 dsh-deep-verbs 二选一

两者都抢同一个状态行节点，同时启用会互相回写、文案抖动。要用本插件，先在 profile 的 `cordis.patch.yml` 里把对方的 `insert` 移除或标 `disabled: true`。

## 词表来源

- **Claude Code spinner verbs**：取自 Claude Code 2.1.121 的提取记录（179 条中保留 158 条，剔掉约 20 条过难词与 1 条品牌梗）。
- **鲸鱼系 13 条**：来自 [`dsh-deep-verbs`](https://github.com/Winter-And-You-Gone/dsh-deep-verbs)（MIT）。
- **中国本土文化段**：原创，成语 / 典故 / 诗词意象 + 生活与网络梗。

## 开发与自测

见 [`DEVELOPING.md`](DEVELOPING.md)。一句话版本：`node verify.mjs`（20 项断言，用 `node:vm` 驱动真实 bundle，不需要浏览器）。

## License

MIT © 2026 Soren (uuicdown)
