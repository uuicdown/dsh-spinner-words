# 安全策略

## 支持的版本

只有 npm 上的最新版本会被维护。更早的版本不再接收修复。

| 版本 | 支持 |
| --- | --- |
| 最新发布版（`npm view dsh-spinner-words version`） | ✅ |
| 更早版本 | ❌ |

## 上报漏洞

**请不要开公开 issue。** 用 GitHub 的私密漏洞报告：

https://github.com/uuicdown/dsh-spinner-words/security/advisories/new

也可以在 Security 标签页里点 "Report a vulnerability"。报告里请包含：

- 复现步骤或最小 PoC
- 受影响的版本
- 你能看到的影响范围（这个插件运行在 DSH 的渲染进程里，只会接触页面 DOM 与 localStorage）

我通常会在 7 天内回复。修复后会先发版，再公开致谢（如果你愿意署名）。

## 这个插件的攻击面

写清楚范围，便于判断哪些报告属于本插件的问题：

- **只运行在浏览器端**：没有宿主端逻辑，不发网络请求，不读文件系统，不执行 `eval` / `new Function`。
- **会写入的持久化数据**：`localStorage` 两个键——`dsh-spinner-words:lang`（语言）与 `dsh-spinner-words:custom`（自定义词池）。
- **会修改的 DOM**：仅限 `[data-chat-running]` 容器内的文本节点、`data-shimmer-text` 属性、`role="status"` 文本，以及一个注入到 `document.head` 的 `<style>`。
- **事件**：`document` 上的 `click` / `dblclick` / `keydown`（捕获阶段），`MutationObserver`，一个 3 秒定时器。禁用插件时通过 `teardown()` 释放。

以下情况**不**算本插件的漏洞，请报给 DSH 本体：

- DSH 状态行自身的渲染或无障碍问题
- 宿主页面已有的 XSS 或其他注入
- 因为 DSH 改版导致插件失效

## 已知限制

- 与 `dsh-deep-verbs` 抢同一个状态行节点，二者只能启用一个。
- 插件依赖 DSH 的内置文案与 `data-chat-running` / `data-shimmer-text` 标记；DSH 改这些实现时插件会失效（不报错，不影响界面）。
- 点击处理放在 document 捕获阶段并 `stopPropagation()`，会拦截宿主加在状态行上的点击行为。
