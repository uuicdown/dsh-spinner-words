# 提交到 awesome 列表

整理时间：2026-11-06。三个候选都活跃（当天有提交），收录规则各不相同。

## 自身条件自查

- [x] 仓库公开、有 `dsh-plugin` topic
- [x] `package.json` 声明 `dsh.bundle`（beancookie 的硬性要求；只声明 `dsh.client` 会被拒）
- [x] npm 可安装：`dsh plugin --profile desktop add dsh-spinner-words`（0.8.4）
- [x] MIT
- [x] 一行能说清，无营销词

## 一、beancookie/awesome-dsh-plugin（★188）

规则（见其 `contributing.md`）：**两个文件各加一行**，`README.md`（中文）与 `README.en.md`（英文），都放在「插件 / Plugins」分类下；一条一句话、以句号结尾；分类内按 `owner/repo` 字母序（CI 的 `check-order.mjs` 会校验，行放任意位置即可，`build-site.mjs` 会自动重排）。

`README.md`（中文）加这一行：

```markdown
- [uuicdown/dsh-spinner-words](https://github.com/uuicdown/dsh-spinner-words) — 把 DSH 状态行换成 287 条双语短语，每回合抽一条，双击状态行可编辑词池。
```

`README.en.md`（英文）加这一行：

```markdown
- [uuicdown/dsh-spinner-words](https://github.com/uuicdown/dsh-spinner-words) - Replaces the DSH running-status line with one of 287 bilingual phrases per turn; the pool is editable from the status line.
```

## 二、0xsline/awesome-deepseek-harness（★1320）

规则：手选清单，一条一行，**只要事实不要营销**；条目格式 `- [owner/repo](url) - Description.`；分类见 `contributing.md`，本插件归 **UI, Themes & Interaction**（英文 README 与 `README.zh-CN.md` 都要加）。

`README.md` 的 `## UI, Themes & Interaction` 段加：

```markdown
- [uuicdown/dsh-spinner-words](https://github.com/uuicdown/dsh-spinner-words) - Replaces the running-status line with one of 287 bilingual phrases per turn; click to switch language, editable pool stored in localStorage.
```

`README.zh-CN.md` 对应中文段加：

```markdown
- [uuicdown/dsh-spinner-words](https://github.com/uuicdown/dsh-spinner-words) - 把运行状态行换成 287 条双语短语，每回合抽一条；点击切中英文，词池可编辑并存在 localStorage。
```

> 它要求条目是「生态下的真实仓库（dsh-external 组织或成员项目）」。我们不是该组织的成员，这一点可能被质疑；若被问到，如实说明是独立社区插件、已在 `dsh-plugin` topic 下、npm 可安装即可。

## 三、libukai/awesome-deepseek-harness（★361）

「少而精」，有实测证据的项目才会被收录，且明确写过「被收录不等于已签名/适合生产」。**暂不投**——等有第三方使用证据（issue、star、其他列表收录）后再提，成功率更高。

## 提交流程（网页，两个文件一次 PR）

以 beancookie 为例：

1. 打开 `https://github.com/beancookie/awesome-dsh-plugin`，点右上 **Fork**
2. 在自己 fork 里打开 `README.md`，点铅笔图标编辑，把中文那行加在「## 插件」下
3. 页面底部选 **Create a new branch for this commit and start a pull request**，分支名填 `add-dsh-spinner-words`
4. 提交后进入 PR 页面，切到 **Files changed**，本 PR 已包含 `README.md`
5. 再加英文：在 PR 里切到你 fork 的这个分支，编辑 `README.en.md`，加上英文那行并提交到同一分支
6. PR 描述写清楚：

```
Add dsh-spinner-words — replaces the running-status line with 287 bilingual phrases,
one per turn, editable pool.

- dsh.bundle declared in package.json (installable via `dsh plugin add`)
- npm: https://www.npmjs.com/package/dsh-spinner-words (0.8.4, MIT)
- Repo tagged with the `dsh-plugin` topic
```

0xsline 那张同理，但只需改一个文件（或两个语言的 README 各一次）。

## 被拒的常见原因（提前避开）

- 只声明 `dsh.client`、没有 `dsh.bundle` —— 我们满足，PR 描述里主动写明
- 描述写成营销语（「更好用」「提升效率」）—— 用的是「做什么」句式
- 表内顺序不对 —— beancookie 有 CI 校验，但会自动重排，不用手工插位
- 一次 PR 提多个插件 —— 只提这一个
