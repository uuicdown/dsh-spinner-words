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
//   - 事件驱动轮换：对话区新挂载「思考/回答段」(assistant-step) 或「工具调用」
//     (tool-call / model-retry) 行时切换到下一条短语；长时间纯思考（没有新行
//     挂载）时短语保持不变；
//   - 保底节流：两次切换至少间隔 MIN_SWITCH_MS（3 秒）；落在窗口内的事件
//     合并为窗口边界的一次补切（连续快速的工具调用只换一次词）；
//   - 回合开场（状态行首次挂载）随机一条开场短语；
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
		var PAIRS = [
			// ======== 1. 鲸鱼系 deep 短语（13 条，来自 dsh-deep-verbs）========
			["deep diving", "深潜中"],
			["deep seeking", "深度求索中"],
			["deep delving", "刨根问底中"],
			["deep surfacing", "喷彩虹中"],
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
			["accomplishing", "收尾中"],
			["actioning", "动手干中"],
			["actualizing", "落实中"],
			["architecting", "搭架构中"],
			["baking", "烘焙中"],
			["beaming", "发光中"],
			["beboppin'", "摇摆中"],
			["befuddling", "犯迷糊中"],
			["billowing", "翻涌中"],
			["blanching", "焯水中"],
			["boogieing", "蹦迪中"],
			["boondoggling", "瞎忙活中"],
			["bootstrapping", "自举中"],
			["brewing", "酿造中"],
			["burrowing", "打洞中"],
			["calculating", "算账中"],
			["canoodling", "腻歪中"],
			["caramelizing", "熬糖中"],
			["cascading", "倾泻中"],
			["catapulting", "弹射中"],
			["cerebrating", "开动脑筋中"],
			["channeling", "通灵中"],
			["choreographing", "编舞中"],
			["churning", "搅动中"],
			["clauding", "克劳德中"],
			["coalescing", "聚拢中"],
			["cogitating", "苦想中"],
			["combobulating", "拼装中"],
			["composing", "谱写中"],
			["computing", "运算中"],
			["concocting", "调制中"],
			["considering", "考量中"],
			["contemplating", "沉思中"],
			["cooking", "下厨中"],
			["crafting", "精雕中"],
			["creating", "创造中"],
			["crunching", "硬算中"],
			["crystallizing", "结晶中"],
			["cultivating", "培育中"],
			["deciphering", "破译中"],
			["deliberating", "权衡中"],
			["determining", "定夺中"],
			["dilly-dallying", "磨蹭中"],
			["discombobulating", "打乱重来中"],
			["doing", "干活中"],
			["doodling", "涂鸦中"],
			["drizzling", "细雨飘落中"],
			["ebbing", "退潮中"],
			["effecting", "促成中"],
			["elucidating", "释义中"],
			["embellishing", "添彩中"],
			["enchanting", "施法中"],
			["envisioning", "构想中"],
			["evaporating", "蒸发中"],
			["fermenting", "发酵中"],
			["finagling", "钻营中"],
			["flambéing", "喷火中"],
			["flowing", "流淌中"],
			["flummoxing", "挠头中"],
			["fluttering", "扑棱中"],
			["forging", "锻造中"],
			["forming", "成形中"],
			["frolicking", "撒欢中"],
			["frosting", "抹糖霜中"],
			["gallivanting", "到处浪中"],
			["galloping", "飞奔中"],
			["garnishing", "摆盘中"],
			["generating", "生成中"],
			["gesticulating", "比划中"],
			["germinating", "发芽中"],
			["gitifying", "提交中"],
			["grooving", "踩点中"],
			["gusting", "阵风中"],
			["harmonizing", "和声中"],
			["hashing", "哈希中"],
			["hatching", "孵化中"],
			["herding", "放牧中"],
			["honking", "鸣笛中"],
			["hyperspacing", "跃迁中"],
			["ideating", "脑暴中"],
			["imagining", "想象中"],
			["improvising", "即兴中"],
			["incubating", "酝酿中"],
			["inferring", "推演中"],
			["infusing", "注入中"],
			["ionizing", "电离中"],
			["levitating", "悬浮中"],
			["lollygagging", "磨洋工中"],
			["manifesting", "显化中"],
			["marinating", "腌制中"],
			["meandering", "蜿蜒中"],
			["metamorphosing", "蜕变中"],
			["misting", "喷雾中"],
			["moonwalking", "太空步中"],
			["moseying", "溜达中"],
			["mulling", "琢磨中"],
			["mustering", "集结中"],
			["musing", "出神中"],
			["nesting", "筑巢中"],
			["noodling", "瞎鼓捣中"],
			["nucleating", "成核中"],
			["orbiting", "绕飞中"],
			["orchestrating", "编排中"],
			["osmosing", "渗透中"],
			["perambulating", "踱步中"],
			["percolating", "渗滤中"],
			["perusing", "翻阅中"],
			["philosophising", "论道中"],
			["photosynthesizing", "光合作用中"],
			["pollinating", "授粉中"],
			["pondering", "深思中"],
			["pouncing", "扑击中"],
			["precipitating", "沉淀中"],
			["processing", "处理中"],
			["proofing", "醒面中"],
			["propagating", "传播中"],
			["puttering", "磨叽中"],
			["puzzling", "解谜中"],
			["recombobulating", "重整中"],
			["reticulating", "编织中"],
			["roosting", "归巢中"],
			["ruminating", "反刍中"],
			["sautéing", "爆炒中"],
			["scampering", "乱窜中"],
			["schlepping", "扛活儿中"],
			["scurrying", "小跑中"],
			["sketching", "打草稿中"],
			["slithering", "游走中"],
			["smooshing", "揉合中"],
			["spelunking", "探洞中"],
			["spinning", "旋转中"],
			["sprouting", "抽芽中"],
			["stewing", "焖煮中"],
			["sublimating", "升华中"],
			["swirling", "回旋中"],
			["swooping", "俯冲中"],
			["synthesizing", "综合中"],
			["tempering", "回火中"],
			["thinking", "思考中"],
			["thundering", "轰隆中"],
			["tinkering", "敲敲打打中"],
			["tomfoolering", "犯傻中"],
			["transfiguring", "变形中"],
			["transmuting", "点石成金中"],
			["twisting", "扭转中"],
			["undulating", "起伏中"],
			["unfurling", "展开中"],
			["unravelling", "拆线中"],
			["vibing", "找感觉中"],
			["waddling", "摇摇摆摆中"],
			["wandering", "漫游中"],
			["warping", "扭曲中"],
			["whirlpooling", "打旋涡中"],
			["whirring", "嗡嗡转中"],
			["whisking", "打发中"],
			["working", "工作中"],
			["wrangling", "收拢中"],
			["zesting", "削皮中"],
			["zigzagging", "蛇皮走位中"],

			// ======== 3. 中国本土文化·雅（成语 / 典故 / 诗词意象）========
			["chipping through the wall", "凿壁偷光中"],
			["hair tied to the beam", "悬梁刺股中"],
			["hair white from the classics", "皓首穷经中"],
			["wearing out the book straps", "韦编三绝中"],
			["burning oil to lengthen the day", "焚膏继晷中"],
			["strolling by candlelight", "秉烛夜游中"],
			["reading under the lamp", "挑灯夜读中"],
			["old lamp and yellowed pages", "青灯黄卷中"],
			["grinding a rod into a needle", "磨杵成针中"],
			["dripping water piercing stone", "滴水穿石中"],
			["the slow bird flies first", "笨鸟先飞中"],
			["still water runs deep", "静水深流中"],
			["clouds drifting, water flowing", "行云流水中"],
			["parting clouds to the sun", "拨云见日中"],
			["unwinding the silk cocoon", "抽丝剥茧中"],
			["following the vine to the melon", "顺藤摸瓜中"],
			["tracing back to the source", "追根溯源中"],
			["weighing every word", "推敲中"],
			["chewing on the characters", "咬文嚼字中"],
			["measuring phrase by phrase", "字字计较中"],
			["pao ding carving the ox", "庖丁解牛中"],
			["the blade gliding with room", "游刃有余中"],
			["the bamboo already in mind", "胸有成竹中"],
			["seeing no whole ox", "目无全牛中"],
			["the axe whirling into wind", "运斤成风中"],
			["great skill looks clumsy", "大巧若拙中"],
			["the great way is simple", "大道至简中"],
			["the highest good is water", "上善若水中"],
			["the loudest note is silence", "大音希声中"],
			["the greatest form has no shape", "大象无形中"],
			["holding to the uncarved block", "抱朴守拙中"],
			["back to the plain and true", "返璞归真中"],
			["forgetting self and thing", "物我两忘中"],
			["prying into things to know", "格物致知中"],
			["the old, revisited, renews", "温故知新中"],
			["thinking carefully, judging clear", "慎思明辨中"],
			["learning wide, acting firm", "博学笃行中"],
			["steeping and savouring", "涵泳玩索中"],
			["clarity poured over the crown", "醍醐灌顶中"],
			["the blocked mind opens", "茅塞顿开中"],
			["suddenly the vista opens", "豁然开朗中"],
			["willows dark, flowers bright", "柳暗花明中"],
			["a winding path to quiet", "曲径通幽中"],
			["another sky behind the door", "别有洞天中"],
			["climbing high to see far", "登高望远中"],
			["the fourfold diagnosis", "望闻问切中"],
			["matching the remedy", "对症下药中"],
			["planning inside the tent", "运筹帷幄中"],
			["deploying the formations", "排兵布阵中"],
			["walking the sand table", "沙盘推演中"],
			["thinking beyond the horizon", "深谋远虑中"],
			["mending before the rain", "未雨绸缪中"],
			["turning it thrice before moving", "三思而行中"],
			["plan settled, then move", "谋定后动中"],
			["one drumbeat of effort", "一鼓作气中"],
			["deep store, light release", "厚积薄发中"],
			["ten years for one blade", "十年磨一剑中"],
			["water arrives, the channel forms", "水到渠成中"],
			["the melon drops when ripe", "瓜熟蒂落中"],
			["waiting for the bloom", "静待花开中"],
			["chewing it slowly", "细嚼慢咽中"],
			["tea by the stove", "围炉煮茶中"],
			["tea and talk", "品茗论道中"],
			["incense lit, qin played", "焚香抚琴中"],
			["rain on banana leaves", "雨打芭蕉中"],
			["listening to the rain", "听雨中"],
			["watching the clouds pass", "观云中"],
			["raising a cup to the moon", "举杯邀月中"],
			["three of us, me and my shadow", "对影成三人中"],
			["chrysanthemums by the east hedge", "采菊东篱中"],
			["the mountain comes into view", "悠然见山中"],
			["one straw cloak in the drizzle", "一蓑烟雨中"],
			["bamboo staff and straw sandals", "竹杖芒鞋中"],
			["the great river runs east", "大江东去中"],
			["sharing the moon a thousand li", "千里共婵娟中"],
			["sunset glow and a lone duck", "落霞孤鹜中"],
			["grinding ink, laying paper", "磨墨铺纸中"],
			["the brush flies, the ink splashes", "挥毫泼墨中"],
			["drafting it in the belly", "打腹稿中"],
			["watching the game in silence", "观棋不语中"],
			["the stone placed, no regret", "落子无悔中"],
			["coiled and ready", "蓄势待发中"],
			["seated in meditation", "参禅入定中"],
			["deep tunnels, full granaries", "深挖洞广积粮中"],
			["crossing the river by feel", "摸石头过河中"],
			["sealed away for cultivation", "闭关修炼中"],

			// ======== 4. 中国本土文化·俗（生活场景 / 网络梗）========
			["getting paid to think", "带薪思考中"],
			["charging the big move", "憋大招中"],
			["working it over", "盘它中"],
			["rolling up the sleeves", "撸起袖子中"],
			["eating the melon", "吃瓜中"],
			["clocking in, soul and all", "打工魂燃烧中"],
			["meeting till the brain dies", "开会开到宕机中"],
			["playing dead", "装死中"],
			["procrastinating", "拖延症发作中"],
			["letting it rot", "摆烂中"],
			["grabbing a bite", "干饭中"],
			["waiting on instant noodles", "等泡面中"],
			["running on coffee", "咖啡续命中"],
			["pulling an all-nighter", "熬夜中"],
			["paddling along", "划水中"],
			["sneaking a break", "偷偷偷懒中"],
			["rebooting the brain", "重启大脑中"],
			["replying at random", "已读乱回中"],
			["a big idea brewing", "一个大想法酝酿中"],
			["leave me to think", "想静静中"],
			["don't rush me", "别催了在想了"],
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

		function labelFor(idx) {
			var pair = PAIRS[idx];
			if (lang === "zh") return pair[1] + "…";
			return pair[0].charAt(0).toUpperCase() + pair[0].slice(1) + "...";
		}

		// ---- 洗牌袋：一袋抽完才补充，保证短期不重复；
		//      袋与袋交界处换掉尾部，避免跨袋连续同一条 ----
		var bag = [];
		var lastIndex = -1;
		function nextPhrase() {
			if (bag.length === 0) {
				bag = PAIRS.map(function (_, i) { return i; });
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
			return changed;
		}

		/** 认领时挂点击监听 + 可点击提示（cursor/title 不在 React vdom 里，
		 *  重渲不会回写覆盖）。点击 = 用户主动操作：切换语言、保留当前短语、
		 *  重置保底节流窗口防止自动轮换立刻覆盖，并同步所有活动状态行。 */
		var toggleReady = new WeakSet();
		function toggleHint() {
			return lang === "zh" ? "点击切换为 English" : "点击切换为中文";
		}
		function onToggle() {
			lang = lang === "zh" ? "en" : "zh";
			try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* noop */ }
			if (current === null || lastIndex < 0) return;
			current = labelFor(lastIndex);
			lastSwitchAt = Date.now();
			pending = false;
			var live = liveStatuses();
			for (var j = 0; j < live.length; j++) {
				setText(live[j], current);
				live[j].title = toggleHint();
			}
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
					current = nextPhrase();
					hadTracked = true;
					lastSwitchAt = Date.now();
					pending = false;
				}
				setText(host, current);
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
			sweep();
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
		exports.apply = function () {
			try {
				window.__dshSpinnerWords = "applied";
				if (typeof console !== "undefined") console.info("[dsh-spinner-words] applied");
			} catch (e) { /* noop */ }
			if (document.body) start();
			else document.addEventListener("DOMContentLoaded", start, { once: true });
		};

		return module.exports;
	}
});
}
