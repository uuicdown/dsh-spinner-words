# 开发与发布

面向维护者。用户文档见 [README.md](README.md)。

## 文件构成

| 文件 | 作用 |
| --- | --- |
| `client.js` | 浏览器端全部逻辑：词池、洗牌袋、认领状态行、事件接管、编辑器、CSS 注入 |
| `index.js` | 宿主端占位，保证 loader entry 是"活的"（否则客户端 bundle 不会被编进 boot） |
| `cordis.patch.yml` | bundle patch，往 profile 里插一条 entry |
| `install.ps1` | 本地目录安装：Junction 进 profile node_modules + 注册 patch，失败退化复制 |
| `verify.mjs` | 自测：`node:vm` + 极简 DOM shim 驱动真实 bundle，不需要浏览器 |
| `make-review.mjs` | 从 `BASE_PAIRS` 生成 `REVIEW.md`，保证清单与线上逐字一致 |
| `REVIEW.md` | 287 条词表审核清单（四段分组 + 渲染效果 + 注脚） |

## 自测

```bash
node verify.mjs
```

30 项断言，覆盖：

1. 静态契约：`__ModuleLoader__` 包裹、模块 id = 包名、锚点、同值守卫、默认中文、清单字段
2. 词池数据：287 条成对、英文/中文各自不重复、分段条数、`[en, zh, gloss?]` 形状
3. 认领与语言：中文默认 → 点击切英文 → 再点回同一条
4. 节奏：回合内 20 次事件不换词；新回合换词；上一回合的 `holding` 占位行仍在时，新回合照样换词
5. 防写入风暴：文案未变时维护扫描零写入
6. 隔离：近似文本不误认领、`holding` 行不被认领、别的 `role=status` 不受影响
7. 注脚与自定义池：第三项进 `title`、`parsePool` 的注释/空行/单侧兜底

## 发布

```bash
npm login
npm publish --access public
```

`package.json` 已声明 `repository` / `homepage` / `bugs` / `files` 白名单与 `dsh.bundle.patch`、`dsh.client.platform`、`exports["./client"]`。

`npm pack` 的产物应只含 8 个文件（`client.js`、`index.js`、`cordis.patch.yml`、`install.ps1`、`package.json`、`README.md`、`DEVELOPING.md`、`LICENSE`）。

## 踩过的坑（别重犯）

这些每一条都曾让功能"装上了但没生效"或"生效了但看不见"：

1. **文案有两处载体**：底层是文本节点，高光层是 `data-shimmer-text` 属性（CSS `::after` 渲染）。只改一处会叠字。
2. **元素选择器要照源码写**：真正的容器是 `div[data-chat-running]`；`role="status"` 那个是 `span` 且视觉隐藏，只给屏幕阅读器。
3. **点击用 document 捕获阶段**：状态行内部会 `stopPropagation`，挂在元素上的 click 收不到。
4. **动画要挂可见层**：`.runningWhaleAnimated`（PNG 遮罩）平时可见，`runningWhaleStill`（SVG）只在减动效时露出。
5. **别给已在动的东西叠动效**：内置鲸鱼自带游动，再叠 transform 会变成抽搐。
6. **改文案的锚点要取证**：从安装包 grep 出真实字面量（`chat.deepDiving` =「深度求索中」/「Deep diving」），别照抄别人的插件。
8. **holding 占位行会让新回合"卡住不动"**：上一回合结束后，状态行会以 `data-holding` 留在 DOM 里。判断"是否已有活动状态行"时必须跳过 holding 行，否则新回合会误判为同一回合、沿用旧词。
7. **批量改源码的脚本要防静默**：CRLF 会让行首正则全部不匹配（脚本仍退出 0）；含引号的文案要 `JSON.stringify` 转义；跑完立刻 `node --check`。

## 本地安装（开发态）

```powershell
pwsh install.ps1
```

走 Junction，所以改 `client.js` 后只需刷新页面；若刷新无效，说明客户端 bundle 在启动时快照，需完全退出 DSH 重开。

## 卸载

删除 profile `node_modules` 下的 `dsh-spinner-words`，并从 profile 的 `cordis.patch.yml` 移除对应 `insert` 块，重启 DSH。
