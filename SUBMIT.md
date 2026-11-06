# 投稿到 DSH 插件市场

面向维护者的收录清单。**包已具备**：公开仓库、npm 可安装版本、MIT 许可、根目录 `package.json`、导出了 `apply()`、README 有安装命令与截图、仓库已加 `dsh-plugin` 主题标签。

## 现状

| 市场 | 收录方式 | 状态 |
| --- | --- | --- |
| [dsh-plugin.org](https://dsh-plugin.org) | 扫描 GitHub `dsh-plugin` topic，自动生成条目 | ✅ 已满足，等下一次扫描 |
| [dshopen.org](https://dshopen.org)（开放插件市场） | 在 `polang233/dsh-plugin-index` 提收录申请 issue | ⏳ 待提（需人工发 issue） |
| dshbase.com / dsh.pub / dsh-plugin.market / deepseekplugin.com | 多为按 npm 包 + 仓库自动聚合 | ⏳ 加完 topic 后自动出现，无需单独提交 |

## 1. dsh-plugin.org（自动）

已加主题标签 `dsh-plugin`，扫描器会自行发现。要求逐条核对：

- [x] 仓库公开
- [x] 主题 `dsh-plugin`
- [x] README 含 `dsh plugin --profile desktop add dsh-spinner-words`
- [x] 导出 `apply()`（`index.js`）
- [x] 根目录 `package.json`
- [x] 已发布 npm（Plugin Hub 内可见的必要条件）

可选加速：在 `dshplugin/dsh-plugin-hub` 提一个 issue，正文用下方模板。

收录后可在 README 挂徽章：

```md
[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/uuicdown/dsh-spinner-words)
```

## 2. dshopen.org（开放插件市场）

入口：[收录申请表](https://github.com/polang233/dsh-plugin-index/issues/new?template=plugin-add.yml)。

它要求：公开源码、**可安装的 npm 版本**、明确的许可证；有自己的 Logo 和完善描述的优先。账号下的 npm 最新版需先推到 0.8.0（线上现在是 0.7.4）。

可直接粘贴的正文：

```
名称：dsh-spinner-words
仓库：https://github.com/uuicdown/dsh-spinner-words
npm：https://www.npmjs.com/package/dsh-spinner-words
分类：界面 / UI
许可证：MIT
Logo：https://github.com/uuicdown/dsh-spinner-words/blob/main/docs/logo.svg

一句话：把 DSH 思考状态行的那句「深度求索中」换成一池双语短语，每回合抽一条。

说明：词池 287 条 —— Claude Code 原版 spinner 词 158 条、鲸鱼系 deep 短语 13 条、
中国本土文化词 116 条（雅 86 / 俗 30），29 条带英文典故注脚，只在悬停时显示。
一回合一个词（与 Claude Code 一致）；点击状态行切中英；双击或 Alt+E 打开词池编辑器，
可一行一条增删改。纯前端插件，不改 DSH 源码，不碰图标、动效、尺寸与颜色。
```

## 3. 其他聚合站

dshbase.com、dsh.pub、dsh-plugin.market、deepseekplugin.com 这类站点按 npm 包名与 GitHub 元数据聚合，加完 topic 后通常会被自动抓取。**无需提交**，但需要满足两个前提：npm 上有包、仓库有 `dsh-plugin` topic。

## 发版顺序

1. 推送当前提交（README / DEVELOPING / Logo / 本文档）
2. 在终端 `npm publish --access public` 发 0.8.0（走浏览器授权）
3. 提 dshopen.org 的收录 issue
4. 等 dsh-plugin.org 扫描；条目出现后在 README 挂徽章
5. 打 `v0.8.0` 标签并写 Release
