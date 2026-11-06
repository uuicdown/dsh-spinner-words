# dsh-spinner-words

> 看腻了思考状态行万年不变的 `Deep diving...`？
> 这个插件把它换成一池子会轮换的短语：**Claude Code 原版 spinner 词 + 鲸鱼系 deep 短语 + 中国本土文化词**，英中双语一一对应，点击状态行即可换语言。

DeepSeek Harness（DSH）**纯前端插件**，不改任何 `@deepseek-ai/dsh-*` 源码。

```text
[用户消息]
深潜中…                      ← 回合开场随机一条（默认中文）
                        ↓ 每新挂载一个思考段/工具调用换一条
凿壁偷光中…                  ← 至少间隔 3 秒
                        ↓ 点击状态行
Chipping through the wall...  ← 同一条短语换语言，不重新抽取
深潜中…（1分23秒）            ← 右侧计时照常走，不受影响
```

## 词池构成（共 288 条，全部 [英文, 中文] 成对）

| 段 | 条数 | 内容 |
| --- | ---: | --- |
| 鲸鱼系 | 13 | 来自 `dsh-deep-verbs` 的原创：`deep diving` / `deep seeking` / `deep breaching` … |
| Claude Code | 159 | Claude Code 2.1.121 官方 179 条 spinner verbs，剔掉约 20 条过难词（`Bloviating`、`Flibbertigibbeting`、`Prestidigitating`、`Sock-hopping`、`Whatchamacalliting` …）后原样保留，词形一字未改 |
| 中国本土·雅 | 86 | 成语 / 典故 / 诗词意象：凿壁偷光、韦编三绝、庖丁解牛、目无全牛、拨云见日、静水深流、采菊东篱、一蓑烟雨、大江东去 … |
| 中国本土·俗 | 30 | 生活场景与网络梗：带薪思考、憋大招、盘它、摆烂、已读乱回、神游太虚、佛系推进 … |

「雅七俗三」：雅段明显厚于俗段，俗段只负责调剂。

## 行为细节

- **洗牌袋抽取**：一袋 288 个索引抽完才重洗，袋内不重复，袋与袋交界也不连出同一条。
- **一回合一个词**（对齐 Claude Code）：每次请求开场从袋里随机抽一条，整个回合保持不动。Claude Code 的「长任务定期换词」至今仍是一条 feature request（[anthropics/claude-code#83521](https://github.com/anthropics/claude-code/issues/83521)），不是默认行为。想慢速轮换就把 `ROTATE_MS` 设成毫秒数，例如 `20000` = 每 20 秒换一条（0 = 回合内不换）。
- **多会话并排**：同一时刻所有活动状态行显示同一条，切换同步。
- **双语切换**：点击状态行中英互切，同一条短语只换语言、不重新抽取；选择写入 `localStorage`（`dsh-spinner-words:lang`），重载后恢复。默认**中文**。
- **计时器不受影响**：右侧 `N分N秒` 是兄弟 `<span>`。

## 安装

### 自动（推荐）

```powershell
pwsh install.ps1            # 或 powershell -ExecutionPolicy Bypass -File install.ps1
```

脚本会：优先选 `~/.dsh/profiles/desktop`（桌面版），否则 `profiles/web`；把本目录 Junction 进 `profiles/node_modules/dsh-spinner-words`；在 profile 的 `cordis.patch.yml` 注册 `insert`。Junction 不可用时（权限/文件系统限制）退化为按 `package.json` 的 `files` 白名单复制。

然后**完全退出 DSH 进程**（不是关窗口）再重启；浏览器访问的刷新页面即可。

### 手动

1. `mklink /J %USERPROFILE%\.dsh\profiles\node_modules\dsh-spinner-words <本目录>`
2. 在 `<profile>/cordis.patch.yml` 追加：
   ```yaml
   - insert:
       - id: dsh-spinner-words
         name: 'dsh-spinner-words'
   ```
3. 重启 DSH。

## ⚠️ 与 dsh-deep-verbs 二选一

两个插件抢同一个 `role="status"` 文本节点：后认领者生效，且会互相回写（表现为文案抖动）。**不要同时启用**。要换用本插件，先把 `cordis.patch.yml` 里的 `dsh-deep-verbs` 那条 `insert` 移除或标 `disabled: true`，再重启。

## 工作原理（为什么不用改源码）

- **可见文案是属性，不是文本节点**。DSH 的 `RunningStatus` 渲染成 `<div data-chat-running>`，可见文字放在 `<span data-shimmer-text="深度求索中">` 上，由 CSS `::after { content: attr(data-shimmer-text) }` 画出来；同一个 div 里的 `<span role="status" class="…visuallyHidden">` 只是给读屏的。所以插件改的是 **`data-shimmer-text` 属性**，并同步读屏节点——改文本节点永远看不见效果。
- **同一句话有两个载体**。`TextShimmer` 为做高光扫描，把文案渲染两份：底层（`Provider=false`）是**文本节点**，高光层（`Provider=true`）才是 `data-shimmer-text` **属性**。只改一层会叠字（自定义短语与「深度求索中」重影）——插件对两处都写。
- React 每秒重渲，值没变就不触碰 DOM；回合结束元素卸载、新回合挂载出新节点时，`MutationObserver`（只订阅 `childList`）捕获并认领。
- 轮换事件来自 `data-chat-flow-kind` 标记（DSH 滚动锚定依赖它，属稳定实现细节）：新挂载且种类在触发集内的行 = 一次轮换事件，`WeakSet` 去重 React 移除重插入。
- `MutationObserver` 只订阅 `childList`：不订阅 `characterData`，否则每个流式 token 都会触发全文档扫描。
- 所有 DOM 写入走 `setText()`「同值不写」。这是硬约束：`Text.data` 赋值即使值不变也会入队 mutation record，抽中原版文案时同值覆写会形成 `sweep→observe→sweep` 微任务风暴，饿死事件循环（2026-08-17 DSH Desktop 冻结事故）。代码里 `setText` 同值守卫 + `current !== BUILTIN` 双闸都在。

### 降级行为

| DSH 变更 | 后果 |
| --- | --- |
| 改掉内置文案（实测：中文 `深度求索中`、英文 `Deep diving`，超 15 秒变 `深度求索中，用时 {duration} ···` / `Deep diving for {duration} ···`；另外兼容老写法 `Deep diving...` 与 `Deep diving…`） | 插件自动 no-op，不报错不崩 |
| 改掉 `data-chat-flow-kind` | 退化为「回合开场换词、回合内不轮换」，界面不坏 |

## 自定义

### 前端直接改（不用改代码）

**`Alt` + 点击状态行**（macOS 也可 `⌘` + 点击）弹出词池编辑器：

- 一行一条 `英文 | 中文`，`#` 开头是注释，空行忽略
- 只写一侧也可以：`只有中文` 会两侧都用这一串
- 「保存」写入 `localStorage`（键 `dsh-spinner-words:custom`），**下一个回合起生效**
- 「恢复默认」清空覆盖，回到内置 288 条

保存后整份词池以你的版本为准（内置池升级不会自动合并）；想拿新词就点「恢复默认」再改一遍。
控制台兜底入口：`window.__dshSpinnerWordsEditor()`。

### 内置词池与常量

`client.js` 顶部是全部可调项：

- `BASE_PAIRS`：内置 `[英文, 中文]` 成对数组。英文存小写（展示时自动首字母大写 + `...`），中文不要自带省略号（展示时自动加 `…`）；两列索引一一对应。
- `ROTATE_MS`：换词节奏。`0`（默认）= 一回合一个词；`20000` = 回合内每 20 秒换一条。
- `MIN_SWITCH_MS`：默认 `3000`，仅在 `ROTATE_MS > 0` 时生效的保底间隔。
- 默认语言：`var lang = "zh"`。

改完重启 DSH 生效。

## 自测

```bash
node verify.mjs
```

`node:vm` + 极简 DOM shim 驱动真实 bundle，不需要浏览器。覆盖：

1. 静态契约（`__ModuleLoader__` 包裹、模块 id = 包名、锚点、同值守卫、默认中文、清单声明）
2. 词池数据（288 条成对、英文/中文各自不重复、分段条数、雅 ≥ 俗×2）
3. 认领与语言（中文默认 → 点击切英文 → 再点回同一条中文）
4. 轮换与节流（31 次无连续重复；<3s 事件不换词）
5. 防写入风暴（文案未变时维护扫描零写入）
6. 隔离（别的 `role="status"` 元素不被改写）
7. 锚点写法兼容（`Deep diving...` / `Deep diving…` / `深度求索中` 都认领；`Loading assets...` 这类近似文本不误伤）
8. 真实形态兼容（`深度求索中，用时 12s ···` 整串文案被认领；React 随计时回写后，维护扫描能恢复当前短语）

## 发布

`package.json` 已备好 `dsh.bundle.patch` / `dsh.client.platform` / `exports["./client"]`，`npm pack` 与 `dsh plugin add` 都能直接识别。

```bash
npm publish --access public          # 包名 dsh-spinner-words
git init && git add -A && git commit -m "feat: dsh-spinner-words 0.1.0"
git remote add origin https://github.com/<you>/dsh-spinner-words.git && git push -u origin main
```

发布到 DSH 插件市场需要向市场索引提交条目（见 [dshopen.org](https://dshopen.org) 的收录说明），一般要求：npm 包可用、README 完整、声明 `dsh.client.platform`。

## License

MIT © 2026 Soren

词表来源：Claude Code spinner verbs（Anthropic 产品文案，采自 `claude-code-best-practice` 的提取记录）；鲸鱼系 13 条来自 `dsh-deep-verbs`（MIT）；中国本土文化段为本项目原创。
