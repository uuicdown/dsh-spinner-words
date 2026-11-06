# Changelog

本文件记录每次版本变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。

> npm 上最早可安装的版本是 **0.7.4**；0.1.0–0.7.3 只存在于 git 历史，未发布到 registry。
> 加过 tag 的版本：[`v0.7.2`](../../releases/tag/v0.7.2)、[`v0.7.3`](../../releases/tag/v0.7.3)、[`v0.8.0`](../../releases/tag/v0.8.0)。

## [0.8.3] — 2026-11-06

### Fixed

- **重复加载会互相踩**：`apply()` 现在带实例守卫，重复调用先拆除旧实例（observer、document 上的三个捕获监听、维护定时器），并导出 `teardown()`。此前禁用/热重载后旧实例的监听仍然活着，点一次状态行会触发两次切换，两个实例还会争抢同一段文案。
- `sweep()` 加 200ms 节流（出现未认领的新行时立即执行），避免流式输出期按 token 触发的全子树扫描。
- `Alt+E` 过滤 `e.repeat`，按住不放不再连续开/关编辑器。
- 删除 `dblclick` 里无效的 `preventDefault()`（该事件不可取消）。
- 保存词池仅在内容真的变化时换词，只改注释或空行不再触发抽新词。

### Tests

- 23 项断言：新增「重复 apply 不叠加监听」「长按重复 / sweep 节流 / dblclick 误用 preventDefault」两组。

## [0.8.2] — 2026-11-06

### Added

- `docs/demo.gif`：演示动图（420×281、10fps、9 秒、456 KB），显示连续两个回合抽到不同短语

### Changed

- README 按 humanizer-zh 重写：合并重复图注，删掉静态截图里看不出来的点击说明

## [0.8.1] — 2026-11-06

### Changed

- npm keywords 扩到 13 个，补 `status-line`、`thinking-words`、`spinner-verbs`、`bilingual`、`chinese`、`word-pool`
- README 章节重排，安装提到最前
- 新增 `docs/launch-post.md`：发布帖正文、标题候选、GIF 录制方案、渠道与禁忌

## [0.8.0] — 2026-11-06

### Fixed

- **状态行跨回合不换词**：上一回合结束后，状态行以 `data-holding` 占位留在 DOM 里，判断「是否已有活动状态行」时把它算了进去，新回合被误判为同一回合、沿用旧词。统计时跳过 holding 行。

### Added

- `docs/logo.svg`：256×256 品牌色块 + 鲸鱼剪影，供插件市场收录使用
- `SUBMIT.md`：三个市场的收录机制与投稿正文
- GitHub 主题标签：`dsh-plugin`、`deepseek-harness`、`dsh`、`spinner`、`spinner-verbs`、`claude-code`、`chinese-culture`

### Changed

- README 换成真实截图（`docs/status.png`），补 npm 安装方式与徽章
- `DEVELOPING.md` 断言数与覆盖清单同步

## [0.7.4] — 2026-11-06

### Changed

- README 按 humanizer-zh 重写：删空泛铺垫、戏剧化标题、装饰性加粗，事实与命令原样保留
- 首次发布到 npm

## [0.7.3] — 2026-11-06

### Changed

- 署名统一为 `Soren (uuicdown)`：`package.json` author、LICENSE 版权人、README 页脚

## [0.7.2] — 2026-11-06

### Changed

- README 拆成 landing 版（面向使用者）与 `DEVELOPING.md`（文件构成、自测覆盖、发布步骤、踩坑记录）

## [0.7.1] — 2026-11-06

### Added

- `package.json` 补 `repository` / `homepage` / `bugs` / `author`
- README 增加 `dsh plugin add` 市场版安装写法

## [0.7.0] — 2026-11-06

### Removed

- **移除小鲸鱼自定义动画**，回到 DSH 内置游动。原因：内置 PNG 遮罩层自带游动，再叠容器 transform 形成双重运动；12 种拟人动作在工具型界面里显得用力过猛。

### Added

- 两条反向断言防回归：源码不得出现 `@keyframes dsw-` 或 `data-dsh-words-motion`

## [0.6.1] — 2026-11-06

### Fixed

- 动画改挂图标容器。此前 keyframes 作用于内层 SVG，而 SVG 平时 `display:none`，正常状态下完全看不见。

## [0.6.0] — 2026-11-06

### Added

- 小鲸鱼按词义换动作，12 种：`dive` / `doze` / `think` / `spin` / `dash` / `shake` / `glow` / `munch` / `sing` / `peek` / `float` / `swim`

> 该特性在 0.7.0 整体移除。

## [0.5.2] — 2026-11-06

### Fixed

- 术语条目保留「X中」原形：哈希中、自举中、电离中、成核中、跃迁中、显化中。此前把它们一并改成「正在…」，属于过度翻译。

## [0.5.1] — 2026-11-06

### Changed

- Claude Code 段 158 条中文统一为「正在 + 动词」进行体（正在搭架子 / 正在掂量 / 正在爆炒）

## [0.5.0] — 2026-11-06

### Changed

- 词池按整理方案修订：英文改写 27 条、删除 `clauding`；中文动结式（顿开 / 开朗 / 灌顶）改为进行体；词条扩成 `[英文, 中文, 注脚?]`，29 条典故注脚只进 hover。词池 287 条（13 + 158 + 86 + 30）。

## [0.4.2] — 2026-11-06

### Fixed

- 点击改由 **document 捕获阶段**接管。挂在元素上的 click 会被状态行内部 `stopPropagation` 吞掉，导致点击无反应。同时新增双击打开编辑器。

## [0.4.1] — 2026-11-06

### Added

- `Alt+E` 快捷键打开词池编辑器（不依赖点击冒泡）

## [0.4.0] — 2026-11-06

### Added

- 前端词池编辑器：`Alt+点击` / 双击打开，一行一条「英文 | 中文」，存在 `localStorage`，可恢复默认
- 自定义词池支持第三项注脚

## [0.3.0] — 2026-11-06

### Changed

- 换词节奏改为**一回合一个词**，对齐 Claude Code（此前按事件轮换，用户反馈「切换太快」）
- 新增 `ROTATE_MS`，`0` = 回合内不换；设成毫秒数可慢速轮换

## [0.2.2] — 2026-11-06

### Fixed

- 订阅 `characterData`：React 每秒把用时写回文本节点时立即恢复，避免每秒闪回内置文案

## [0.2.1] — 2026-11-06

### Fixed

- 同时改写底层**文本节点**与高光层 **`data-shimmer-text` 属性**。TextShimmer 把同一句话渲染成两处载体，只改一处会叠字

## [0.2.0] — 2026-11-06

### Fixed

- **首次真正生效**：改写 `[data-chat-running]` 内全部 `[data-shimmer-text]` 节点（此前几版改错了元素或载体，用户始终看不到变化）

## [0.1.6] — 2026-11-06

### Changed

- 探针同时写控制台，用于分级定位「模块是否加载 / apply 是否调用 / 是否认领成功」

## [0.1.5] — 2026-11-06

### Added

- 窗口标题三级探针（module-loaded / applied / claimed），无需开发者工具即可判断卡在哪一环

## [0.1.4] — 2026-11-06

### Added

- `window.__dshSpinnerWords` 加载标记
- `dsh.client` 补 `inject: []`、`manifestVersion: 1`，与可用的客户端插件对齐

## [0.1.3] — 2026-11-06

### Fixed

- 改为写 `data-shimmer-text` 属性而非文本节点（可见文案由 CSS `::after` 从属性取值渲染）

## [0.1.2] — 2026-11-06

### Fixed

- 锚点改为从安装包实测的真实文案：中文「深度求索中」、英文「Deep diving」，并兼容超 15 秒后的「…用时 {duration} ···」整串形态

## [0.1.1] — 2026-11-06

### Fixed

- 同时认领 `Deep diving...`（三个点）与 `Deep diving…`（U+2026）两种写法

## [0.1.0] — 2026-11-06

### Added

- 首版：288 条双语词池（Claude Code 179 剔 20 + 鲸鱼系 13 + 雅 86 + 俗 30）、洗牌袋抽取、点击切中英、点击提示
