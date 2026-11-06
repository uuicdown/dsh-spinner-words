// dsh-spinner-words: DeepSeek Harness 前端插件（纯插件，不改 DSH 源码）。
//
// 行为：把内置 ChatView 思考状态行的 "Deep diving..." 换成随机轮换的双语短语。
//   - 词池分四段：[EN, ZH] 成对，索引一一对应：
//       1) 鲸鱼系 deep 短语（dsh-deep-verbs 的 13 条原创）
//       2) Claude Code spinner verbs（2.1.121 官方 179 条，剔掉约 20 条过难词）
//       3) 中国本土文化·雅（成语 / 典故 / 诗词意象）
//       4) 中国本土文化·俗（生活场景 / 网络梗）
//     雅七俗三：雅段明显厚于俗段。
//   - 洗牌袋抽取：一袋之内不重复、袋与袋交界也不连出同一条；
//   - 节奏：默认「一回合一个词」——回合开场（状态行首次挂载）随机抽一条，
//     整个回合保持不变，与 Claude Code 一致；把 ROTATE_MS 设成毫秒数才会
//     在回合内按时间慢速轮换（仍受 MIN_SWITCH_MS=3 秒保底）；
//   - 回合内新挂载「思考/回答段」(assistant-step) 或「工具调用」(tool-call /
//     model-retry) 行，只在 ROTATE_MS > 0 时才算一次换词机会；
//   - 同一时刻多个状态行（多会话并排）同步显示同一条（事件不区分会话）；
//   - 计时器（15 秒后出现的 "N分N秒"）是兄弟 <span>，不受影响；
//   - 双语：默认中文，点击状态行在中/英之间切换：同一条短语换语言展示、
//     不重新抽取；语言选择存 localStorage，重载后恢复。
//
// 实现方式：属性改写（不是文本节点），不覆盖任何渲染插槽。
//   RunningStatus 的真实结构（从 DSH 安装包 app.asar 的源码读出）：
//     <div data-chat-running [data-holding] aria-hidden=…>
//       <span role="status" aria-live="polite" class="…visuallyHidden">深度求索中</span>
//       <span class="…runningDivider" aria-hidden="true"/>
//       <span class="…runningContent">
//         <RunningWhaleTail/>
//         <span data-shimmer-text="深度求索中">…</span>   ← 可见文字由 CSS ::after 画
//       </span>
//     </div>
//   可见文案来自 data-shimmer-text 属性（`::after{content:attr(data-shimmer-text)}`），
//   DOM 里没有对应文本节点——写文本节点用户永远看不见（v0.1.0~v0.1.2 就栽在这里）。
//   所以「认领」= 找 [data-chat-running] 里的 [data-shimmer-text] 并改属性；
//   role=status 那个节点是给读屏的视觉隐藏元素，同步写入保证读屏念的和看到的一致。
//   React 每秒重渲，值没变就不触碰 DOM；回合结束元素卸载、新回合挂载出新节点时，
//   MutationObserver（仅订阅 childList）捕获并认领。
//   轮换事件来自同一 observer：ChatNodeSeat 渲染的每个对话行都带宿主自用的
//     data-chat-flow-kind = user | assistant-step | tool-call | ...
//   （DSH 滚动锚定依赖该标记，属稳定实现细节）。新挂载、种类在触发集内、
//   没见过（WeakSet 去重重插入）的行 = 一次轮换事件；流式 token 只更新既有
//   行内部、不挂新行，不会误触发。
//   若 DSH 未来改掉 BUILTIN 文案，插件退化为 no-op；改掉 data-chat-flow-kind
//   则退化为「回合开场换词、回合内不轮换」——均不影响任何界面。
//   - 所有 DOM 写入走 setText()「同值不写」：Text.data 赋值即使值不变也会
//     入队 characterData mutation record 并再次触发本插件自己的 observer；
//     当轮换抽中原版 "deep diving"（与内置文案逐字相同）时，同值覆写会形成
//     sweep→observe→sweep 微任务风暴，饿死事件循环、冻结整个前端
//     （2026-08-17 DSH Desktop 冻结事故，CDP 三次采样实锤）。
//   - 点击切换双语：认领状态行时挂 click 监听，并加 cursor:pointer 与
//     title 提示。React 每秒重渲该组件但 vdom 不含这两项（与文本节点同理，
//     不会回写覆盖）；点击只换语言、保留当前短语，并重置保底节流窗口，
//     防止随后的自动轮换立刻覆盖用户的选择。
// Bundle 格式遵循 DSH client 模块系统：window.__ModuleLoader__.load({id, factory})。
// 纯浏览器实现：无 require 依赖，host（Node）进程误导入本文件时静默跳过。
// 状态标记：模块执行到哪一步会写在 window.__dshSpinnerWords 上
// （module-loaded → applied → claimed），排查时在 console 看一眼即可，不碰界面。
try {
	if (typeof window !== "undefined") {
		window.__dshSpinnerWords = "module-loaded";
		if (typeof console !== "undefined") console.info("[dsh-spinner-words] module-loaded");
	}
} catch (e) { /* noop */ }

if (typeof window !== "undefined" && window.__ModuleLoader__) {
window.__ModuleLoader__.load({
	id: "dsh-spinner-words",
	factory: (require) => {
		"use strict";
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		// ---- 内置文案锚点 ----
		// 实测（DSH 桌面版，i18n key chat.deepDiving / chat.deepDivingFor）：
		//   中文「深度求索中」  → 超过 15 秒变「深度求索中，用时 {duration} ···」
		//   英文「Deep diving」 → 超过 15 秒变「Deep diving for {duration} ···」
		// 两者都没有省略号；社区插件锚定的 "Deep diving..." 在这一版并不存在。
		// 老写法（三个点 / U+2026）一并保留，跨版本兼容。
		// 全都认不出来 = 自动停用（见文件头），不报错不崩。
		var ANCHORS = ["深度求索中", "Deep diving", "Deep diving...", "Deep diving…"];
		var DURATION_RE = /^(?:深度求索中，用时 |Deep diving for ).*···$/;
		var BUILTIN = ANCHORS[0];
		function isAnchor(text) {
			if (ANCHORS.indexOf(text) !== -1) return true;
			return DURATION_RE.test(text);
		}

		// ---- 轮换节奏：默认「一回合一个词」（与 Claude Code 一致）----
		// Claude Code 每次请求随机抽一条 spinner verb，整个回合保持不变；
		// 「长任务定期换词」在它那儿仍是一个 feature request（anthropics/claude-code#83521）。
		// 想改成慢速轮换就设成毫秒数，例如 20000 = 每 20 秒换一条；0 = 回合内不换。
		var ROTATE_MS = 0;

		// ---- 仅在 ROTATE_MS > 0 时才生效的保底间隔 ----
		var MIN_SWITCH_MS = 3000;

		// ---- 维护扫描节奏：认领兜底 / React 回写修复（不推进短语） ----
		var MAINTAIN_MS = 3000;

		// ---- 语言：默认中文，点击状态行切换；localStorage 记忆，
		//      重载后恢复（隐私模式等不可用场景下维持默认） ----
		var LANG_KEY = "dsh-spinner-words:lang";
		var lang = "zh";
		try {
			var saved = localStorage.getItem(LANG_KEY);
			if (saved === "en" || saved === "zh") lang = saved;
		} catch (e) { /* 不可用则维持默认 */ }

		// ---- 轮换事件源：新挂载对话行的 data-chat-flow-kind 触发集 ----
		// assistant-step = 新的思考/回答段；tool-call = 新的（根）工具调用；
		// model-retry = 重试即重新生成。user/steering/command 等非模型活动不算。
		var TRIGGER_KINDS = {
			"assistant-step": 1,
			"tool-call": 1,
			"model-retry": 1
		};
		var FLOW_KIND_ATTR = "data-chat-flow-kind";
		var FLOW_SEL = "[data-chat-flow-kind]";

		// ---- 词池：[英文, 中文]，索引一一对应（点击切换语言时保留同一条）----
		// 展示规则：英文首字母大写 + "..."；中文原样 + "…"（中文条目自带
		// 「中」字进行体，与英文 -ing 对应）。
		var BASE_PAIRS = [
			// ======== 1. 鲸鱼系 deep 短语（13 条，来自 dsh-deep-verbs）========
			["deep diving", "深潜中"],
			["deep seeking", "深度求索中"],
			["deep delving", "刨根问底中"],
			["deep spouting", "喷彩虹中"],
			["deep breaching", "跃出海面中"],
			["deep bubbling", "海底冒泡中"],
			["deep singing", "引吭高歌中"],
			["deep fishing", "深度摸鱼中"],
			["deep sinking", "缓缓沉底中"],
			["deep sleeping", "呼呼大睡中"],
			["deep napping", "偷偷打盹中"],
			["deep dreaming", "白日做梦中"],
			["deep cooking", "小火慢炖中"],

			// ======== 2. Claude Code spinner verbs（2.1.121，剔难词后 159 条）========
			["accomplishing", "正在收尾"],
			["taking action", "正在动手"],
			["actualizing", "正在落实"],
			["architecting", "正在搭架子"],
			["baking", "正在烘焙"],
			["beaming", "正在发光"],
			["beboppin'", "正在摇摆"],
			["befuddled", "正在犯迷糊"],
			["billowing", "正在翻涌"],
			["blanching", "正在焯水"],
			["boogieing", "正在蹦迪"],
			["doing busywork", "正在瞎忙活"],
			["bootstrapping", "自举中"],
			["brewing", "正在酿造"],
			["burrowing", "正在打洞"],
			["calculating", "正在算账"],
			["canoodling", "正在腻歪"],
			["caramelizing", "正在熬糖"],
			["cascading", "正在倾泻"],
			["catapulting", "正在弹射"],
			["putting on the thinking cap", "正在开动脑筋"],
			["channeling spirits", "正在通灵"],
			["choreographing", "正在编舞"],
			["churning", "正在搅动"],
			["coalescing", "正在聚拢"],
			["cogitating", "正在苦想"],
			["assembling", "正在拼装"],
			["composing", "正在谱写"],
			["computing", "正在运算"],
			["concocting", "正在调制"],
			["considering", "正在掂量"],
			["contemplating", "正在沉思"],
			["cooking", "正在下厨"],
			["crafting", "正在精雕"],
			["creating", "正在创造"],
			["crunching", "正在硬算"],
			["crystallizing", "正在结晶"],
			["cultivating", "正在培育"],
			["deciphering", "正在破译"],
			["deliberating", "正在权衡"],
			["determining", "正在定夺"],
			["dilly-dallying", "正在磨蹭"],
			["resetting", "正在推倒重来"],
			["doing", "正在干活"],
			["doodling", "正在涂鸦"],
			["drizzling", "正在下毛毛雨"],
			["ebbing", "正在退潮"],
			["bringing about", "正在促成"],
			["elucidating", "正在解释"],
			["embellishing", "正在添彩"],
			["casting a spell", "正在施法"],
			["envisioning", "正在构想"],
			["evaporating", "正在蒸发"],
			["fermenting", "正在发酵"],
			["finagling", "正在钻空子"],
			["blowtorching", "正在喷火"],
			["flowing", "正在流淌"],
			["flummoxed", "正在挠头"],
			["fluttering", "正在扑棱"],
			["forging", "正在锻造"],
			["forming", "正在成形"],
			["frolicking", "正在撒欢"],
			["frosting", "正在抹糖霜"],
			["gallivanting", "正在到处浪"],
			["galloping", "正在飞奔"],
			["garnishing", "正在摆盘"],
			["generating", "正在生成"],
			["gesticulating", "正在比划"],
			["germinating", "正在发芽"],
			["committing", "正在提交"],
			["grooving", "正在踩点"],
			["gusting", "正在刮阵风"],
			["harmonizing", "正在和声"],
			["hashing", "哈希中"],
			["hatching", "正在孵化"],
			["herding", "正在放牧"],
			["honking", "正在鸣笛"],
			["jumping to hyperspace", "跃迁中"],
			["brainstorming", "正在头脑风暴"],
			["imagining", "正在想象"],
			["improvising", "正在即兴"],
			["incubating", "正在酝酿"],
			["inferring", "正在推演"],
			["infusing", "正在注入"],
			["ionizing", "电离中"],
			["levitating", "正在悬浮"],
			["lollygagging", "正在磨洋工"],
			["manifesting", "显化中"],
			["marinating", "正在腌制"],
			["meandering", "正在蜿蜒"],
			["metamorphosing", "正在蜕变"],
			["misting", "正在喷雾"],
			["moonwalking", "正在走太空步"],
			["moseying", "正在溜达"],
			["mulling", "正在琢磨"],
			["mustering", "正在集结"],
			["musing", "正在出神"],
			["nesting", "正在筑巢"],
			["noodling", "正在瞎鼓捣"],
			["nucleating", "成核中"],
			["orbiting", "正在绕飞"],
			["orchestrating", "正在编排"],
			["seeping", "正在渗透"],
			["pacing", "正在踱步"],
			["percolating", "正在渗滤"],
			["perusing", "正在翻阅"],
			["philosophising", "正在论道"],
			["photosynthesizing", "正在光合作用"],
			["pollinating", "正在授粉"],
			["pondering", "正在深思"],
			["pouncing", "正在扑击"],
			["precipitating", "正在沉淀"],
			["processing", "正在处理"],
			["proofing", "正在醒面"],
			["propagating", "正在传播"],
			["puttering", "正在磨叽"],
			["solving puzzles", "正在解谜"],
			["reassembling", "正在重整"],
			["reticulating", "正在编制样条"],
			["roosting", "正在归巢"],
			["ruminating", "正在反刍"],
			["sautéing", "正在爆炒"],
			["scampering", "正在乱窜"],
			["schlepping", "正在扛活儿"],
			["scurrying", "正在小跑"],
			["sketching", "正在打草稿"],
			["slithering", "正在游走"],
			["smooshing", "正在揉合"],
			["spelunking", "正在探洞"],
			["spinning", "正在旋转"],
			["sprouting", "正在抽芽"],
			["stewing", "正在焖煮"],
			["sublimating", "正在升华"],
			["swirling", "正在回旋"],
			["swooping", "正在俯冲"],
			["synthesizing", "正在综合"],
			["tempering", "正在回火"],
			["thinking", "正在思考"],
			["thundering", "正在轰隆"],
			["tinkering", "正在敲敲打打"],
			["fooling around", "正在犯傻"],
			["transfiguring", "正在变形"],
			["transmuting", "正在点石成金"],
			["twisting", "正在扭转"],
			["undulating", "正在起伏"],
			["unfurling", "正在展开"],
			["unravelling", "正在拆线"],
			["vibing", "正在找感觉"],
			["waddling", "正在摇摇摆摆"],
			["wandering", "正在漫游"],
			["warping", "正在扭曲"],
			["whirling", "正在打旋儿"],
			["whirring", "正在嗡嗡转"],
			["whisking", "正在打发"],
			["working", "正在工作"],
			["wrangling", "正在收拢"],
			["zesting", "正在削皮"],
			["zigzagging", "正在蛇皮走位"],

			// ======== 3. 中国本土文化·雅（成语 / 典故 / 诗词意象）========
			["chipping through the wall", "凿壁偷光中", "boring a hole in the wall to steal a neighbor's lamplight"],
			["hair tied to the beam", "悬梁刺股中", "tying one's hair to the beam and prodding one's thigh with an awl"],
			["studying the classics", "正在穷经", "studying the classics until one's hair turns white"],
			["reading through the book", "正在翻书", "wearing out the leather book straps three times"],
			["burning oil to lengthen the day", "焚膏继晷中"],
			["strolling by candlelight", "秉烛夜游中"],
			["reading under the lamp", "挑灯夜读中"],
			["old lamp and yellowed pages", "青灯黄卷中"],
			["grinding a rod into a needle", "磨杵成针中", "grinding an iron rod into a needle"],
			["dripping water piercing stone", "滴水穿石中"],
			["the slow bird flies first", "笨鸟先飞中"],
			["still water runs deep", "静水深流中"],
			["clouds drifting, water flowing", "行云流水中"],
			["parting clouds to the sun", "拨云见日中", "parting the clouds to see the sun"],
			["unwinding the silk cocoon", "抽丝剥茧中"],
			["following the vine to the melon", "顺藤摸瓜中"],
			["tracing back to the source", "追根溯源中"],
			["weighing every word", "推敲中"],
			["chewing on the characters", "咬文嚼字中"],
			["measuring phrase by phrase", "字字计较中"],
			["pao ding carving the ox", "庖丁解牛中"],
			["the blade gliding with room", "游刃有余中", "the blade gliding with plenty of room"],
			["the bamboo already in mind", "胸有成竹中", "the bamboo already complete in mind"],
			["seeing no whole ox", "目无全牛中"],
			["the axe whirling into wind", "运斤成风中", "whirling the axe so fast it becomes wind"],
			["great skill looks clumsy", "大巧若拙中"],
			["mulling over \"the great way is simple\"", "正在悟大道至简"],
			["taking in \"the highest good is like water\"", "正在体会上善若水", "the highest good is like water"],
			["listening for the great sound", "正在听大音希声"],
			["pondering \"the greatest form has no shape\"", "正在琢磨大象无形"],
			["holding to the uncarved block", "抱朴守拙中"],
			["returning to the plain and true", "正在返璞归真", "returning to the plain and true"],
			["losing myself", "正在忘我", "forgetting both self and things"],
			["prying into things to know", "格物致知中", "investigating things to attain knowledge"],
			["the old, revisited, renews", "温故知新中", "reviewing the old to learn the new"],
			["thinking carefully, judging clear", "慎思明辨中", "thinking carefully and judging clearly"],
			["learning wide, acting firm", "博学笃行中", "learning widely and acting firmly"],
			["steeping and savouring", "涵泳玩索中"],
			["getting the point", "正在被点醒", "clarified butter poured over the crown (sudden enlightenment)"],
			["having a breakthrough", "正在开窍"],
			["figuring it out", "正在想通"],
			["willows dark, flowers bright", "柳暗花明中"],
			["a winding path to quiet", "曲径通幽中"],
			["another sky behind the door", "别有洞天中"],
			["climbing high to see far", "登高望远中"],
			["the fourfold diagnosis", "望闻问切中", "observing, listening, questioning, and pulse-taking"],
			["matching the remedy", "对症下药中", "matching the remedy to the illness"],
			["planning inside the tent", "运筹帷幄中"],
			["deploying the formations", "排兵布阵中"],
			["walking the sand table", "沙盘推演中", "walking through the sand table exercise"],
			["thinking beyond the horizon", "深谋远虑中"],
			["mending before the rain", "未雨绸缪中", "mending the roof before it rains"],
			["turning it thrice before moving", "三思而行中", "turning it over three times before acting"],
			["plan settled, then move", "谋定后动中"],
			["one drumbeat of effort", "一鼓作气中"],
			["deep store, light release", "厚积薄发中"],
			["grinding the sword", "正在磨一剑", "ten years to grind one blade"],
			["waiting for the channel to form", "正在等水到渠成", "when water arrives, the channel forms"],
			["waiting for the melon to drop when ripe", "正在等瓜熟蒂落"],
			["waiting for the bloom", "静待花开中"],
			["chewing it slowly", "细嚼慢咽中"],
			["tea by the stove", "围炉煮茶中"],
			["tea and talk", "品茗论道中"],
			["incense lit, qin played", "焚香抚琴中"],
			["listening to rain on banana leaves", "正在听雨打芭蕉"],
			["listening to the rain", "听雨中"],
			["watching the clouds pass", "观云中"],
			["raising a cup to the moon", "举杯邀月中"],
			["making three with my shadow", "正在对影成三人", "raising a cup to the moon, my shadow and I make three"],
			["chrysanthemums by the east hedge", "采菊东篱中", "picking chrysanthemums by the east hedge"],
			["the mountain comes into view", "悠然见山中", "the southern mountain comes into view"],
			["one straw cloak in the drizzle", "一蓑烟雨中"],
			["bamboo staff and straw sandals", "竹杖芒鞋中"],
			["watching the great river run east", "正在看大江东去"],
			["gazing at the moon", "正在望月", "sharing the moon a thousand li apart"],
			["watching sunset glow and a lone duck", "正在看落霞孤鹜"],
			["grinding ink, laying paper", "磨墨铺纸中"],
			["the brush flies, the ink splashes", "挥毫泼墨中"],
			["drafting it in the belly", "打腹稿中"],
			["watching the game in silence", "观棋不语中"],
			["the stone placed, no regret", "落子无悔中"],
			["coiled and ready", "蓄势待发中"],
			["seated in meditation", "参禅入定中"],
			["deep tunnels, full granaries", "深挖洞广积粮中"],
			["crossing the river by feel", "摸石头过河中", "crossing the river by feeling the stones"],
			["sealed away for cultivation", "闭关修炼中"],

			// ======== 4. 中国本土文化·俗（生活场景 / 网络梗）========
			["getting paid to think", "带薪思考中"],
			["charging up the ultimate move", "憋大招中"],
			["working it over", "盘它中"],
			["rolling up the sleeves", "撸起袖子中"],
			["eating the melon", "吃瓜中"],
			["clocking in with soul on fire", "打工魂燃烧中"],
			["meeting until the brain crashes", "开会开到宕机中"],
			["playing dead", "装死中"],
			["procrastinating", "拖延症发作中"],
			["letting it rot", "摆烂中"],
			["grabbing a bite", "干饭中"],
			["waiting for instant noodles", "等泡面中"],
			["running on coffee", "咖啡续命中"],
			["pulling an all-nighter", "熬夜中"],
			["paddling along", "划水中"],
			["sneaking a break", "偷偷偷懒中"],
			["rebooting the brain", "重启大脑中"],
			["replying at random", "已读乱回中"],
			["a big idea brewing", "一个大想法酝酿中"],
			["leave me to think", "想静静中"],
			["don't rush me, I'm thinking", "别催了在想了"],
			["going with the flow", "佛系推进中"],
			["leaving it to fate", "随缘中"],
			["roaming free", "云游中"],
			["taking a walk", "散步中"],
			["spacing out", "发呆中"],
			["spinning in place", "原地转圈中"],
			["soul leaving the body", "灵魂出窍中"],
			["wandering the void", "神游太虚中"],
			["holding it in", "憋着不吭声中"]
		];

		// ---- 自定义词池 ----
		// localStorage 里的自定义池覆盖内置池；编辑器在状态行上 Alt+点击打开，
		// 一行一条「英文 | 中文」（# 开头为注释，只写一侧则两侧同用）。
		var CUSTOM_KEY = "dsh-spinner-words:custom";
		var activePairs = BASE_PAIRS;

		function parsePool(text) {
			var out = [];
			var lines = String(text == null ? "" : text).split(/\r?\n/);
			for (var i = 0; i < lines.length; i++) {
				var line = lines[i].trim();
				if (!line || line.charAt(0) === "#") continue;
				var bar = line.indexOf("|");
				var en = bar === -1 ? line : line.slice(0, bar).trim();
				var zh = bar === -1 ? line : line.slice(bar + 1).trim();
				if (!en && !zh) continue;
				if (!en) en = zh;
				if (!zh) zh = en;
				out.push([en, zh]);
			}
			return out;
		}

		function poolPairs() {
			try {
				var raw = localStorage.getItem(CUSTOM_KEY);
				if (raw) {
					var parsed = JSON.parse(raw);
					var clean = [];
					if (Array.isArray(parsed)) {
						for (var i = 0; i < parsed.length; i++) {
							var p = parsed[i];
							if (p && typeof p[1] === "string" && p[1]) {
								clean.push([
									String(p[0] || p[1]),
									p[1],
									typeof p[2] === "string" ? p[2] : "",
									typeof p[3] === "string" ? p[3] : ""
								]);
							}
						}
					}
					if (clean.length > 0) return clean;
				}
			} catch (e) { /* 坏数据 → 回落内置池 */ }
			return BASE_PAIRS;
		}

		var lastRaw = "\u0000";
		function refreshPool() {
			var raw = null;
			try { raw = localStorage.getItem(CUSTOM_KEY); } catch (e) { raw = null; }
			if (raw === lastRaw) return; // 没变就不动袋子，保住"一袋抽完才重洗"
			lastRaw = raw;
			activePairs = poolPairs();
			bag = [];
		}

		// ---- 小鲸鱼的动作：按词义挑选，让"姿态"符合语境 ----
		// 只往图标元素写一个属性，具体的 keyframes 由注入的 CSS 驱动，
		// 不动 React 管理的 DOM 树，重渲也不会打架。
		var MOTION_ATTR = "data-dsh-words-motion";
		var DEFAULT_MOTION = "swim";
		var currentMotion = DEFAULT_MOTION;

		// [关键词数组, 动作]，从上往下第一个命中者生效（顺序 = 优先级）
		var MOTION_RULES = [
			[["深潜", "潜水", "沉底", "打洞", "探洞", "挖洞", "沉底", "钓鱼"], "dive"],
			[["睡", "打盹", "做梦", "发呆", "出神", "摆烂", "装死", "偷懒", "磨蹭", "磨叽", "磨洋工", "拖延", "打坐", "参禅"], "doze"],
			[["想", "琢磨", "沉思", "苦想", "推演", "解谜", "掂量", "权衡", "定夺", "考量", "深思", "构想", "想象", "挠头", "犯迷糊", "破译", "推断"], "think"],
			[["旋转", "回旋", "打旋", "绕飞", "转圈", "扭转", "蛇皮", "扭摆", "绕"], "spin"],
			[["跑", "飞奔", "弹射", "跃迁", "扑", "俯冲", "乱窜", "窜", "小跑", "弹"], "dash"],
			[["舞", "蹦迪", "摇摆", "踩点", "摇摇摆摆", "摇", "抖", "颤", "嗡嗡", "抖腿"], "shake"],
			[["发光", "结晶", "显化", "升华", "光合", "点石成金", "喷彩虹", "冒泡", "电离", "亮"], "glow"],
			[["烘焙", "焯水", "熬糖", "抹糖霜", "摆盘", "腌制", "醒面", "爆炒", "焖煮", "回火", "打发", "削皮", "调制", "下厨", "发酵", "酿造", "揉", "吃", "干饭", "泡面", "咖啡", "煮", "炖", "茶", "闷"], "munch"],
			[["唱", "和声", "歌", "引吭"], "sing"],
			[["打草稿", "翻阅", "翻书", "穷经", "读", "书", "谱写", "编排"], "peek"],
			[["漫游", "溜达", "踱步", "散步", "云游", "蜿蜒", "流淌", "起伏", "游走", "悬浮", "风", "雨", "潮", "浪", "云"], "float"]
		];

		function motionFor(zh, en) {
			var hay = (zh || "") + " " + (en || "");
			for (var i = 0; i < MOTION_RULES.length; i++) {
				var words = MOTION_RULES[i][0];
				for (var k = 0; k < words.length; k++) {
					if (hay.indexOf(words[k]) !== -1) return MOTION_RULES[i][1];
				}
			}
			return DEFAULT_MOTION;
		}

		/** 第 4 项（可选）可手动指定动作，例如 ["x","正在转圈","", "spin"]。 */
		function motionAt(idx) {
			var p = activePairs[idx] || BASE_PAIRS[0];
			return (p && typeof p[3] === "string" && p[3]) ? p[3] : motionFor(p[1], p[0]);
		}

		function ensureMotionCss() {
			if (document.querySelector("style[data-dsh-words-motion-css]")) return;
			var s = document.createElement("style");
			s.setAttribute("data-dsh-words-motion-css", "");
			s.textContent = "" +
				"@keyframes dsw-swim{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-1px) rotate(-6deg)}}" +
				"@keyframes dsw-dive{0%,100%{transform:translateY(-1px) rotate(-14deg)}50%{transform:translateY(1px) rotate(-22deg)}}" +
				"@keyframes dsw-float{0%,100%{transform:translate3d(-1px,0,0)}50%{transform:translate3d(1px,-1px,0)}}" +
				"@keyframes dsw-doze{0%,100%{transform:translateY(0) scale(1);opacity:.9}50%{transform:translateY(1px) scale(.94);opacity:.6}}" +
				"@keyframes dsw-think{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(-15deg) translateY(-1px)}}" +
				"@keyframes dsw-spin{to{transform:rotate(360deg)}}" +
				"@keyframes dsw-dash{0%,100%{transform:translateX(-1px)}50%{transform:translateX(1px)}}" +
				"@keyframes dsw-shake{0%,100%{transform:rotate(-6deg)}25%{transform:rotate(7deg)}75%{transform:rotate(-3deg)}}" +
				"@keyframes dsw-glow{0%,100%{opacity:.55;transform:scale(.96)}50%{opacity:1;transform:scale(1.1)}}" +
				"@keyframes dsw-munch{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(1px) scale(1.09)}}" +
				"@keyframes dsw-sing{0%,100%{transform:rotate(0) translateY(0)}50%{transform:rotate(8deg) translateY(-1px)}}" +
				"@keyframes dsw-peek{0%,100%{transform:translateX(0)}50%{transform:translateX(1px) rotate(4deg)}}" +
				"[data-dsh-words-motion],[data-dsh-words-motion] svg,[data-dsh-words-motion] span{transform-origin:50% 60%;will-change:transform}" +
				'[data-dsh-words-motion="swim"] svg{animation:dsw-swim 2.2s ease-in-out infinite}' +
				'[data-dsh-words-motion="dive"] svg{animation:dsw-dive 2.6s ease-in-out infinite}' +
				'[data-dsh-words-motion="float"] svg{animation:dsw-float 2.8s ease-in-out infinite}' +
				'[data-dsh-words-motion="doze"] svg{animation:dsw-doze 3.4s ease-in-out infinite}' +
				'[data-dsh-words-motion="think"] svg{animation:dsw-think 2.4s ease-in-out infinite}' +
				'[data-dsh-words-motion="spin"] svg{animation:dsw-spin 2.4s linear infinite}' +
				'[data-dsh-words-motion="dash"] svg{animation:dsw-dash .8s ease-in-out infinite}' +
				'[data-dsh-words-motion="shake"] svg{animation:dsw-shake 1.1s ease-in-out infinite}' +
				'[data-dsh-words-motion="glow"] svg{animation:dsw-glow 1.8s ease-in-out infinite}' +
				'[data-dsh-words-motion="munch"] svg{animation:dsw-munch 1.4s ease-in-out infinite}' +
				'[data-dsh-words-motion="sing"] svg{animation:dsw-sing 1.6s ease-in-out infinite}' +
				'[data-dsh-words-motion="peek"] svg{animation:dsw-peek 2s ease-in-out infinite}' +
				"@media (prefers-reduced-motion: reduce){[data-dsh-words-motion] svg{animation:none!important}}";
			document.head.appendChild(s);
		}

		/** 把动作写到小吉祥物元素上（同值不写，避免每秒重渲白写）。 */
		function applyMotion(host, motion) {
			var icon = host.querySelector('[class*="runningIcon"]');
			if (!icon || !motion) return false;
			if (icon.getAttribute(MOTION_ATTR) === motion) return false;
			icon.setAttribute(MOTION_ATTR, motion);
			return true;
		}

		function labelFor(idx) {
			var pair = activePairs[idx] || BASE_PAIRS[0];
			if (lang === "zh") return pair[1] + "…";
			return pair[0].charAt(0).toUpperCase() + pair[0].slice(1) + "...";
		}

		// ---- 洗牌袋：一袋抽完才补充，保证短期不重复；
		//      袋与袋交界处换掉尾部，避免跨袋连续同一条 ----
		var bag = [];
		var lastIndex = -1;
		var currentGloss = "";

		/** 第 3 项（可选）= 完整典故，只进 hover 注解，不进状态行（长句会撑行）。 */
		function glossFor(idx) {
			var p = activePairs[idx];
			return (p && typeof p[2] === "string") ? p[2] : "";
		}

		/** 把当前词条的注解写进所有活动状态行的 title。 */
		function syncTitles() {
			var live = liveStatuses();
			for (var i = 0; i < live.length; i++) {
				live[i].title = currentGloss ? currentGloss + " · " + toggleHint() : toggleHint();
			}
		}
		function nextPhrase() {
			if (bag.length === 0) {
				bag = activePairs.map(function (_, i) { return i; });
				for (var i = bag.length - 1; i > 0; i--) {
					var j = Math.floor(Math.random() * (i + 1));
					var t = bag[i]; bag[i] = bag[j]; bag[j] = t;
				}
				if (lastIndex >= 0 && bag.length > 1 && bag[bag.length - 1] === lastIndex) {
					var k = Math.floor(Math.random() * (bag.length - 1));
					var u = bag[k]; bag[k] = bag[bag.length - 1]; bag[bag.length - 1] = u;
				}
			}
			lastIndex = bag.pop();
			currentGloss = glossFor(lastIndex);
			currentMotion = motionAt(lastIndex);
			return labelFor(lastIndex);
		}

		// ---- 改写状态 ----
		// tracked：已认领的思考状态行（WeakSet 随元素卸载自动回收）；
		// seenRows：已计入过事件的对话行（去重 React 移除重插入等场景）；
		// current：全局当前短语，所有活动状态行同步显示，轮换只推进这一个；
		// lastSwitchAt：上次切换（含开场认领）时间戳，构成保底节流窗口；
		// pending：窗口内到达、等待窗口边界补切的轮换事件。
		var tracked = new WeakSet();
		var seenRows = new WeakSet();
		var ownedText = new WeakSet();
		var claimedOnce = false;
		var current = null;
		var lastSwitchAt = 0;
		var pending = false;
		var releaseScheduled = false;

		function hostList() {
			return document.querySelectorAll("[data-chat-running]");
		}

		function shimmerOf(host) {
			return host.querySelector("[data-shimmer-text]");
		}

		/** 状态行里所有承载文案的文本节点。
		 *  TextShimmer 底层（Provider=false）把文案渲染成**文本节点**，
		 *  高光层（Provider=true）才用 data-shimmer-text 属性——两处都要写。 */
		function textTargets(host) {
			var els = host.querySelectorAll("*");
			var out = [];
			for (var i = 0; i < els.length; i++) {
				var kids = els[i].childNodes;
				if (!kids) continue;
				for (var k = 0; k < kids.length; k++) {
					if (kids[k].nodeType === 3 && kids[k].data) out.push(kids[k]);
				}
			}
			return out;
		}

		/** 这一行当前是否还显示着内置文案（属性或文本节点任一处）。 */
		function anyAnchor(host) {
			var pixels = host.querySelectorAll("[data-shimmer-text]");
			for (var i = 0; i < pixels.length; i++) {
				if (isAnchor(pixels[i].getAttribute("data-shimmer-text"))) return true;
			}
			var texts = textTargets(host);
			for (var j = 0; j < texts.length; j++) {
				if (isAnchor(texts[j].data)) return true;
			}
			return false;
		}

		function liveStatuses() {
			var list = hostList();
			var live = [];
			for (var i = 0; i < list.length; i++) {
				if (tracked.has(list[i])) live.push(list[i]);
			}
			return live;
		}

		/** 可见文案由 CSS `::after { content: attr(data-shimmer-text) }` 画出，
		 *  DOM 里没有对应文本节点——必须写属性，写文本节点用户永远看不见。
		 *  同值不写：React 每秒重渲，值没变就不再触碰 DOM。
		 *  role=status 的读屏节点同步成同一条，保证读屏念的和眼睛看到的一致。
		 *  返回本次是否真的写了 DOM。 */
		function setText(host, label) {
			var changed = false;
			// TextShimmer 会渲染两个同属性节点：可见文字层 + 高光扫过层（.sweep/.decoration）。
			// 只改一个 → 两层文字叠在一起，用户看到自定义短语和「深度求索中」重影。
			var pixels = host.querySelectorAll("[data-shimmer-text]");
			for (var p = 0; p < pixels.length; p++) {
				if (pixels[p].getAttribute("data-shimmer-text") !== label) {
					pixels[p].setAttribute("data-shimmer-text", label);
					changed = true;
				}
			}
			var texts = textTargets(host);
			for (var t = 0; t < texts.length; t++) {
				var node = texts[t];
				// 只碰持有内置文案的节点，或我们自己之前写过、需要跟着轮换的节点
				if (!isAnchor(node.data) && !ownedText.has(node)) continue;
				if (node.data !== label) {
					ownedText.add(node);
					node.data = label;
					changed = true;
				}
			}
			var a11y = host.querySelector('[role="status"]');
			var first = a11y && a11y.firstChild;
			if (first && first.nodeType === 3 && first.data !== label) {
				first.data = label;
				changed = true;
			}
			if (applyMotion(host, currentMotion)) changed = true;
			return changed;
		}

		/** 认领时挂点击监听 + 可点击提示（cursor/title 不在 React vdom 里，
		 *  重渲不会回写覆盖）。点击 = 用户主动操作：切换语言、保留当前短语、
		 *  重置保底节流窗口防止自动轮换立刻覆盖，并同步所有活动状态行。 */
		var toggleReady = new WeakSet();
		function toggleHint() {
			return lang === "zh"
				? "点击切换为 English；Alt+点击 或 Alt+E 编辑词池"
				: "Click to switch to 中文; Alt+click or Alt+E edits the word pool";
		}
		function onToggle(e) {
			// Alt / Cmd + 点击 = 打开词池编辑器（加减词、改映射）
			if (e && (e.altKey || e.metaKey)) { openEditor(); return; }
			lang = lang === "zh" ? "en" : "zh";
			try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* noop */ }
			if (current === null || lastIndex < 0) return;
			current = labelFor(lastIndex);
			lastSwitchAt = Date.now();
			pending = false;
			var live = liveStatuses();
			for (var j = 0; j < live.length; j++) setText(live[j], current);
			syncTitles();
		}
		// ---- 词池编辑器（Alt+点击状态行，或控制台 window.__dshSpinnerWordsEditor()）----
		var editorEl = null;

		function closeEditor() {
			if (editorEl && editorEl.parentNode) editorEl.parentNode.removeChild(editorEl);
			editorEl = null;
		}

		function openEditor() {
			if (editorEl) { closeEditor(); return; }
			var wrap = document.createElement("div");
			wrap.setAttribute("data-dsh-spinner-words-editor", "");
			wrap.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483000;width:min(440px,90vw);" +
				"background:#1b1b1f;color:#eee;border:1px solid #3a3a42;border-radius:10px;" +
				"box-shadow:0 8px 30px rgba(0,0,0,.45);font:12px/1.6 ui-monospace,Menlo,Consolas,monospace;padding:10px;";

			var title = document.createElement("div");
			title.textContent = "dsh-spinner-words · 词池编辑器（一行一条：英文 | 中文，# 开头是注释）";
			title.style.cssText = "margin-bottom:6px;color:#8cd0ff;";

			var ta = document.createElement("textarea");
			ta.value = activePairs.map(function (p) { return p[0] + " | " + p[1]; }).join("\n");
			ta.style.cssText = "width:100%;height:240px;background:#111;color:#ddd;border:1px solid #333;" +
				"border-radius:6px;padding:6px;box-sizing:border-box;resize:vertical;";

			var bar = document.createElement("div");
			bar.style.cssText = "display:flex;gap:8px;margin-top:8px;";

			function mkBtn(label, fn) {
				var b = document.createElement("button");
				b.textContent = label;
				b.style.cssText = "flex:1;padding:6px 8px;border-radius:6px;border:1px solid #3a3a42;" +
					"background:#2a2a31;color:#eee;cursor:pointer;";
				b.addEventListener("click", fn);
				return b;
			}

			bar.appendChild(mkBtn("保存", function () {
				var pairs = parsePool(ta.value);
				try {
					if (pairs.length === 0) localStorage.removeItem(CUSTOM_KEY);
					else localStorage.setItem(CUSTOM_KEY, JSON.stringify(pairs));
				} catch (e) { /* noop */ }
				refreshPool();
				closeEditor();
				switchNow();
			}));
			bar.appendChild(mkBtn("恢复默认", function () {
				try { localStorage.removeItem(CUSTOM_KEY); } catch (e) { /* noop */ }
				refreshPool();
				closeEditor();
				switchNow();
			}));
			bar.appendChild(mkBtn("关闭", closeEditor));

			wrap.appendChild(title);
			wrap.appendChild(ta);
			wrap.appendChild(bar);
			document.body.appendChild(wrap);
			editorEl = wrap;
		}

		/** 从事件目标向上找被认领的状态行（document 捕获阶段用，避免依赖行内冒泡）。 */
		function hostFromEvent(target) {
			var el = target;
			while (el && el !== document.body) {
				if (el.getAttribute && el.getAttribute("data-chat-running") !== null) return el;
				el = el.parentNode;
			}
			return null;
		}

		function attachToggle(el) {
			if (toggleReady.has(el)) return;
			toggleReady.add(el);
			el.addEventListener("click", onToggle);
			el.style.cursor = "pointer";
			el.title = toggleHint();
		}

		/** 立即切换：取下一条短语同步到所有活动状态行。 */
		function switchNow() {
			pending = false;
			var live = liveStatuses();
			if (live.length === 0) return;
			current = nextPhrase();
			lastSwitchAt = Date.now();
			for (var j = 0; j < live.length; j++) setText(live[j], current);
			syncTitles();
		}

		/** 轮换事件入口：默认 ROTATE_MS = 0，回合内一律不换词（一回合一个词）。
		 *  只有把 ROTATE_MS 设成毫秒数时才按节流换。 */
		function onActivity() {
			if (ROTATE_MS <= 0) { pending = false; return; }
			if (liveStatuses().length === 0) { pending = false; return; } // 回合未运行
			var elapsed = Date.now() - lastSwitchAt;
			if (elapsed >= MIN_SWITCH_MS) { switchNow(); return; }
			pending = true;
			scheduleRelease(MIN_SWITCH_MS - elapsed);
		}

		function scheduleRelease(delay) {
			if (releaseScheduled) return;
			releaseScheduled = true;
			setTimeout(function () {
				releaseScheduled = false;
				if (!pending) return;
				var wait = MIN_SWITCH_MS - (Date.now() - lastSwitchAt);
				if (wait > 0) { scheduleRelease(wait); return; } // 时钟异常的保险
				switchNow();
			}, delay);
		}

		/** 扫描：认领新挂载的思考状态行；兜底 React 回写。 */
		function sweep() {
			var list = hostList();
			var hadTracked = false;
			for (var i = 0; i < list.length; i++) {
				if (tracked.has(list[i])) { hadTracked = true; break; }
			}
			for (var j = 0; j < list.length; j++) {
				var host = list[j];
				// holding = 本轮已结束、元素留着占位（带 data-holding 且 aria-hidden），
				// 不是"正在思考"，不认领也不进袋。
				if (host.hasAttribute && host.hasAttribute("data-holding")) continue;
				if (!shimmerOf(host)) continue;
				var anchored = anyAnchor(host);
				if (tracked.has(host)) {
					// 兜底：React 若把内置文案写回来了（属性或文本节点任一），恢复当前短语。
					if (anchored && current !== null && !isAnchor(current)) setText(host, current);
					applyMotion(host, currentMotion); // 图标元素被重渲替换时补回动作
					continue;
				}
				if (!anchored) continue; // 不是思考状态行，不碰
				tracked.add(host);
				attachToggle(host);
				if (!claimedOnce) {
					claimedOnce = true;
					try {
						window.__dshSpinnerWords = "claimed";
						if (typeof console !== "undefined") console.info("[dsh-spinner-words] claimed a running row");
					} catch (e) { /* noop */ }
				}
				// 此前已无活动状态行 = 新回合开场：从袋里取新的一条；
				// 取完立刻置位，同一批挂载的多行（多会话并排）复用同一条。
				// 开场词即本回合首次展示：重置节流窗口，并丢弃上一回合
				// 遗留的 pending（新回合有自己的开场词，不需要补切）。
				if (!hadTracked) {
					refreshPool(); // 新回合：顺带拾取用户在编辑器里改过的词池
					current = nextPhrase();
					hadTracked = true;
					lastSwitchAt = Date.now();
					pending = false;
				}
				setText(host, current);
				syncTitles();
			}
		}

		/** 单个新增节点里找触发行：自身是 flow 行，或是包含 flow 行的容器。
		 *  ChatNodeSeat 的行不会互相嵌套，命中自身时不必再查后代。 */
		function countRow(row) {
			if (seenRows.has(row)) return false;
			var kind = row.getAttribute && row.getAttribute(FLOW_KIND_ATTR);
			if (TRIGGER_KINDS[kind] !== 1) return false;
			seenRows.add(row);
			return true;
		}

		function activityFromNode(node) {
			if (!node || node.nodeType !== 1) return false;
			var hit = false;
			if (node.hasAttribute && node.hasAttribute(FLOW_KIND_ATTR)) {
				if (countRow(node)) hit = true;
			} else if (node.querySelectorAll) {
				var inner = node.querySelectorAll(FLOW_SEL);
				for (var i = 0; i < inner.length; i++) {
					if (countRow(inner[i])) hit = true;
				}
			}
			return hit;
		}

		/** 从文本节点向上找状态行容器（React 改文本时只有 mutation.target，没有 addedNodes）。 */
		function hostOf(node) {
			var n = node && node.parentNode;
			while (n) {
				if (n.getAttribute && n.getAttribute("data-chat-running") !== null) return n;
				n = n.parentNode;
			}
			return null;
		}

		/** React 每秒把「用时」写回底层文本节点：立刻恢复，不等 3 秒维护扫描，
		 *  否则用户会看到闪回内置文案。 */
		function restoreTextNodes(mutations) {
			for (var i = 0; i < mutations.length; i++) {
				var m = mutations[i];
				if (m.type !== "characterData") continue;
				var node = m.target;
				if (!node || node.nodeType !== 3) continue;
				if (!isAnchor(node.data)) continue; // 我们自己的写入不是锚点，不会自激
				var host = hostOf(node);
				if (!host || !tracked.has(host)) continue;
				if (current !== null && !isAnchor(current)) setText(host, current);
			}
		}

		function collectActivity(mutations) {
			var hit = false;
			for (var i = 0; i < mutations.length; i++) {
				var added = mutations[i].addedNodes;
				if (!added) continue;
				for (var j = 0; j < added.length; j++) {
					if (activityFromNode(added[j])) hit = true;
				}
			}
			return hit;
		}

		// observer 回调可能成串到达：合并到微任务里一次处理；
		// 先 sweep（认领/兜底），再消费本批攒下的轮换事件
		var scheduled = false;
		var activityFlag = false;
		function onMutate(mutations) {
			restoreTextNodes(mutations);
			if (collectActivity(mutations)) activityFlag = true;
			if (scheduled) return;
			scheduled = true;
			Promise.resolve().then(function () {
				scheduled = false;
				sweep();
				var act = activityFlag;
				activityFlag = false;
				if (act) onActivity();
			});
		}

		/** 3 秒维护扫描：认领兜底 + React 回写修复 + pending 的保险释放
		 *  （后台标签页定时器被节流时兜住窗口边界的补切）。不推进短语。 */
		function maintain() {
			sweep();
			// 慢速轮换（仅在 ROTATE_MS > 0 时启用）：按时间而不是按事件换词
			if (ROTATE_MS > 0 && current !== null && liveStatuses().length > 0 &&
				Date.now() - lastSwitchAt >= ROTATE_MS) {
				switchNow();
				return;
			}
			if (pending && Date.now() - lastSwitchAt >= MIN_SWITCH_MS) switchNow();
		}

		function start() {
			refreshPool();
			ensureMotionCss();
			sweep();
			// 点击接管放在 document 捕获阶段：状态行内部（React/行组件）可能
			// stopPropagation，冒泡到元素上的监听就永远不触发（用户实测点不动）。
			document.addEventListener("click", function (e) {
				var host = hostFromEvent(e.target);
				if (!host || !tracked.has(host)) return;
				e.stopPropagation();
				if (e.altKey || e.metaKey) {
					e.preventDefault();
					openEditor();
					return;
				}
				onToggle();
			}, true);

			// 双击 = 打开词池编辑器（不带修饰键也能进）
			document.addEventListener("dblclick", function (e) {
				var host = hostFromEvent(e.target);
				if (!host || !tracked.has(host)) return;
				e.stopPropagation();
				e.preventDefault();
				openEditor();
			}, true);

			// 键盘入口：Alt+E 打开词池编辑器。不依赖点击冒泡，行组件拦事件也照样能开。
			document.addEventListener("keydown", function (e) {
				if (!e || !e.altKey || e.ctrlKey || e.metaKey) return;
				if (e.key === "e" || e.key === "E") {
					e.preventDefault();
					e.stopPropagation();
					openEditor();
				}
			}, true);
			setInterval(maintain, MAINTAIN_MS);
			// childList：认领新挂载的状态行、捕获轮换事件；
			// characterData：React 每秒回写「用时」到文本节点时立刻恢复（只筛锚点，代价 O(1)）。
			new MutationObserver(onMutate).observe(document.body, {
				childList: true,
				characterData: true,
				subtree: true
			});
		}

		exports.inject = [];
		exports.parsePool = parsePool; // 供编辑器与测试复用
		exports.motionFor = motionFor; // 供测试校验"词义 → 动作"的映射
		exports.apply = function () {
			try {
				window.__dshSpinnerWords = "applied";
				window.__dshSpinnerWordsEditor = openEditor; // 控制台兜底入口
				if (typeof console !== "undefined") console.info("[dsh-spinner-words] applied");
			} catch (e) { /* noop */ }
			if (document.body) start();
			else document.addEventListener("DOMContentLoaded", start, { once: true });
		};

		return module.exports;
	}
});
}
