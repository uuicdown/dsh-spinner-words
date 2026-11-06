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

It appears on every running turn, and a long turn leaves it on screen for minutes. Several community plugins already exist just to replace it — they DOM-patch the status
line at runtime (e.g. dsh-deep-verbs, dsh-claudecode-tips, dsh-status-rotator, and my own
dsh-spinner-words).

Patching works, but it brings three problems that a built-in option would avoid:

1. **Fragile.** A plugin has to anchor on the exact rendered text and on implementation
   details (`data-chat-running`, `data-shimmer-text`). Any wording change silently disables it,
   with no error surfaced to the user.
2. **They conflict.** Two such plugins fight over the same DOM node and the text flickers.
   Users are told to keep exactly one installed.
3. **It duplicates accessibility work.** The status text is rendered in two places (a text node and
   a `data-shimmer-text` attribute consumed by CSS `::after`), plus a visually-hidden
   `role="status"` node. Every plugin has to rediscover this and keep them in sync.

Proposal: expose the status words as configuration rather than a fixed translation, e.g.

- a settings entry (or `dsh.config` namespace, whichever fits) holding a word list;
- modes: `default` | `replace` | `append`;
- optionally pick per turn rather than rotating mid-turn — Claude Code picks one word per
  request and keeps it for the whole turn, which reads calmer than a per-second change.

From the outside the change looks small: a settings value plus an override for two i18n keys, with
no new UI beyond one settings row. I have not read the core code, so treat that as an estimate.

It would also make the existing plugins unnecessary rather than competing with them.

Reference implementation (MIT, if useful): https://github.com/uuicdown/dsh-spinner-words —
it also documents the two carriers of the text and the `holding` row behavior, which cost me a
few iterations to get right.

Would this fit the roadmap? I am not asking for the 287-word pool to be bundled — only for the
rendering to read from configuration, so any word list (including none) can be supplied.
```

## 第二篇：Show Your Plugins!

分类：**Show Your Plugins!**

标题：

```
dsh-spinner-words — 287 bilingual phrases for the running-status line, with an editable pool
```

正文：

```
Small plugin, one job: replace the running-status line with one phrase per turn.

![demo](https://raw.githubusercontent.com/uuicdown/dsh-spinner-words/main/docs/demo.gif)

What it does:

- 287 phrases: Claude Code's spinner verbs (158), a whale-themed set (13), and Chinese
  idiomatic and poetic phrases (116).
- One phrase per turn, held for the whole turn — no rotation mid-turn.
- Click the status line to switch language: same phrase, no re-roll.
- Double-click or `Alt+E` opens an editor. The pool is `english | 中文` lines in localStorage,
  so you can replace it with your own list.
- 29 phrases carry an English gloss, shown on hover only.
- Text and interaction only: icons, animation, sizes and colours are untouched.

```
dsh plugin --profile desktop add dsh-spinner-words
```

Repo: https://github.com/uuicdown/dsh-spinner-words · MIT

Two notes. It patches the same status node as dsh-deep-verbs, so keep one of them, not both.
And if you would rather see this as a built-in option, there is a separate thread for that:
#12493.
```

## 发帖注意

- 两篇分开发，**先发 Ideas**，隔一天再发 Showcase；同一天连发两条容易被看成纯推广
- Ideas 那篇不要催回复，官方说明了「团队小，不一定逐条回复，但会看」
- 有人回复时优先回答问题，不要急着贴链接
