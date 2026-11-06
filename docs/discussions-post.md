# Discussions 投稿

发到官方仓库 `deepseek-ai/deepseek-harness`。社区 PR 不被接受，Discussions 是官方指定的反馈渠道。

## 第一篇（推荐）：Ideas

分类：**Ideas**

标题：

```
Make the running-status words configurable instead of hardcoded
```

正文：

```
The running-status line always renders the same localized string — `chat.deepDiving`
("深度求索中" / "Deep diving"), with `chat.deepDivingFor` appending elapsed time after 15s
(`server`-side strings, visible in the i18n pack).

It is arguably the most-repeated string in the product: during a long turn the user stares
at it. Several community plugins already exist just to replace it — they DOM-patch the status
line at runtime (e.g. dsh-deep-verbs, dsh-claudecode-tips, dsh-status-rotator, and my own
dsh-spinner-words).

Patching works, but the approach has three problems that a first-class option would remove:

1. **Fragile.** A plugin has to anchor on the exact rendered text and on implementation
   details (`data-chat-running`, `data-shimmer-text`). Any wording change silently disables it,
   with no error surfaced to the user.
2. **They conflict.** Two such plugins fight over the same DOM node and the text flickers.
   Users are told to keep exactly one installed.
3. **It hides accessibility work.** The status text is rendered in two places (a text node and
   a `data-shimmer-text` attribute consumed by CSS `::after`), plus a visually-hidden
   `role="status"` node. Every plugin has to rediscover this and keep them in sync.

Proposal: expose the status words as configuration rather than a fixed translation, e.g.

- a settings entry (or `dsh.config` namespace, whichever fits) holding a word list;
- modes: `default` | `replace` | `append`;
- optionally pick per turn rather than rotating mid-turn — Claude Code picks one word per
  request and keeps it for the whole turn, which reads calmer than a per-second change.

Scope looks small: it is a settings value plus an override for two i18n keys, no new UI surface
required beyond one settings row. It would also make the existing plugins unnecessary rather
than competing with them.

Reference implementation (MIT, if useful): https://github.com/uuicdown/dsh-spinner-words —
it also documents the two carriers of the text and the `holding` row behavior, which cost me a
few iterations to get right.

Would this fit the roadmap? I am not asking for the 287-word pool to be bundled — only for the
rendering to read from configuration, so any word list (including none) can be supplied.
```

## 第二篇（可选）：Show Your Plugins!

分类：**Show Your Plugins!**

标题：

```
dsh-spinner-words — 287 bilingual phrases for the running-status line, with an editable pool
```

正文：

```
Small plugin, single purpose: replace the running-status line with one phrase per turn.

- 287 phrases: Claude Code's spinner verbs (158), a whale-themed set (13), and Chinese
  idiomatic/poetic phrases (116).
- One word per turn, matching Claude Code's cadence — no rotation mid-turn.
- Click the status line to switch language (same phrase, no re-roll).
- Double-click or `Alt+E` opens an editor; the pool is `english | 中文` lines stored in
  localStorage, so you can replace it with your own.
- Text and interaction only: icons, animation, sizes and colors are untouched.
- 29 phrases carry an English gloss shown on hover.

```bash
dsh plugin --profile desktop add dsh-spinner-words
```

Repo: https://github.com/uuicdown/dsh-spinner-words · MIT

Note: it conflicts with dsh-deep-verbs — both patch the same status node, keep one.
```

## 发帖注意

- 两篇分开发，**先发 Ideas**，隔一天再发 Showcase；同一天连发两条容易被看成纯推广
- Ideas 那篇不要催回复，官方说明了「团队小，不一定逐条回复，但会看」
- 有人回复时优先回答问题，不要急着贴链接
