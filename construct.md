# qq-bridge 架构说明（construct.md）

> 本文是**现状说明**：把项目自带的骨架和这两天在本机追加的东西放在一起讲。
> 依据：`src/` 当前代码（`bridge.js` 约 13,100 行 + 25 个模块）、`dsh/`、`plugins/`、`public/console.html`、
> `config.json` 的 `socialV2.*`，以及 `state/` 里的运行数据和备份文件（`.bak-*` 能看出最近加过哪些页/功能）。
> 生成时间：2026-10-25。文中标「**本期新增**」的，是这两天加/改出来的；其余是项目原有结构。

---

## 0. 一句话

QQ 消息经 SnowLuma（OneBot v11 / WebSocket）进桥接，桥接把它变成 DSH 的 agent prompt；
agent 的回复和「手」（MCP 工具）再通过桥接的本地 HTTP 控制台发回 QQ。
**桥接是唯一有状态的中枢，DSH 是大脑，MCP server 是手。**

```
QQ ──► SnowLuma (127.0.0.1:3001, OneBot WS)
         │
         ▼
   src/bridge.js ──────────────► DSH Web API（session.prompt / events.mux）
    · 会话状态、唤醒判定、提示词装配      │
    · 发送队列、限频、看门狗             ▼
         ▲                     MCP servers（stdio）
         │                      · mcp-snowluma-safe.js   二代仿真工具面（token 鉴权）
         │                      · mcp-host-server.js     管理端/宿主工具
         │                      · mcp-web-search-safe.js 只读联网搜索
         └──── HTTP 127.0.0.1:3100 ◄── 工具调用（带 x-console-token + x-agent-token）
```

---

## 1. 仓库结构（原生 + 本期新增）

| 路径 | 作用 | 备注 |
| --- | --- | --- |
| `src/bridge.js` | 主程序：控制台 HTTP、OneBot 收发、会话状态、唤醒/发送、看门狗 | 单体大文件（约 13,100 行），所有「组件」都从这里被调用 |
| `src/conversation-drive.js` | **本期新增** 会话推进组件：这轮要不要追问一句 / 起个新话题 | 冷却 + 概率，写进提示词 |
| `src/reply-shape.js` | **本期新增** 回复形态组件：这轮最多几条、要不要合并 | 正事 1 条 / 闲聊 3 条 / 刚连发压到 1 条 |
| `src/sticker-picker.js` | **本期新增** 表情挑选组件：按语境给收藏表情打分，输出 top3 候选 | 只排序，不发送 |
| `src/user-profile.js` | **本期新增** 全局用户画像：完整 info + 可分享 info 两层 | 落盘 `state/user-profiles.json` |
| `src/dsh-client.js` | DSH API 客户端：Cookie 鉴权、slash-RPC、events.mux 事件流、回合收集 | 协议层唯一实现 |
| `src/snowluma-conn.js` | SnowLuma 端点/令牌发现与持久化 | 与独立语音工具共用 |
| `src/mcp-snowluma-safe.js` | 给 AI 的 QQ 工具面（发消息/等待/记忆/表情/语音/转发…），按 `socialV2.tools` 开关逐个注册 | 安全版：所有调用落到 bridge HTTP，不直连 QQ |
| `src/mcp-host-server.js` | 宿主侧工具（管理端开发模式用） | |
| `src/mcp-web-search-safe.js` | 只读联网搜索/抓取 | 不执行任何本地操作 |
| `src/content-guard.js` | **近期新增** 内容安全闸门：feedback/传话/外部文本统一净化 | 防注入、防挤爆上下文、拒收违规 |
| `src/slang-learner.js` | 黑话学习：抽取/研究/合并证据/确认 | 控制台「黑话」页 |
| `src/sticker-lib.js` | 表情本地库：同步 QQ 收藏、备注/标签、按语境出提示 | 控制台表情页 |
| `src/voice-core.js` / `src/send-voice-lib.js` | 语音库与发送 | 与仓库外 `voice-tool` 共用核心 |
| `src/token-ledger.js` / `src/model-prices.js` | Token 账本与价格表（白饭计数器） | 控制台「用量」页 |
| `src/media-normalize.js` / `src/safe-fetch.js` | 图片/动图规范化、安全抓取 | 动图抽帧拼图给视觉模型 |
| `src/forward.js` | 合并转发解析 | |
| `src/role-card.js` / `src/preset-prompt.js` | 人格卡解析、sim-prompt 预设前缀 | `roles/*.md`、控制台「人格」页 |
| `src/v2-wait.js` / `src/qq-model-view.js` / `src/md-to-plain.js` | 等待判定、消息模型视图、Markdown→纯文本 | |
| `src/self-test.js` | 自检脚本 | `npm run self-test` |
| `dsh/agent-presets/` | 三个 preset 的**权威源**：`qq-chat`、`qq-chat-v2`、`qq-chat-dev` | 改完要重新生成 bundle patch 并重启 DSH |
| `plugins/` | DSH 插件：`qq-agent-presets`（装 preset）、`qq-mode-console`（`qq-mode` 设置命名空间） | 改了要重装/重启 DSH |
| `public/console.html` | 桥接自带控制台（127.0.0.1:3100） | 页面：overview / sessions / persona / social-v1 / social-v2 / slang / reference / access / operations / usage |
| `roles/` | 人格卡（`大肥鱼.md` 当前在用，另有小鲸鱼、傲娇助手） | 保存即生效 |
| `scripts/` | 95 个调试/测试/运维脚本 | 命名约定见 `docs/FOLDER_MAP.md` |
| `state/` | 运行时数据：会话、模型映射、日志、锁、令牌、记忆、画像、表情库、黑话库、账本 | **用户数据，别删** |
| `config.json` | 真实配置（模板 `config.example.json`） | 白名单/`socialV2.*`/角色 |

---

## 2. 一条消息的完整生命周期

### 2.1 收消息

1. SnowLuma 推 OneBot 事件（私聊/群消息、拍一拍、心跳）。
2. `bridge.js` 解析成消息对象，调用 `appendSocialV2Message(key, sender, text, plain, …)`：
   - 写入 `st.recentMessages`、`st.unread`，更新 `lastUnreadSeq/lastIncomingAt`；
   - 作废「沉睡前已等待」计时（有新消息就要重新观察）；
   - 命中 `activeTopics` 关键字/参与者时刷新 `lastMentionAt`；
   - **本期新增** 调 `userProfiles.recordContact(...)` 记身份、会话、互动次数（不发消息）。
3. 落盘 `state/social-v2.json`，并按 `wakeConfig` 决定是否唤醒（@ / 名字 / 关键词 / 提问 / 拍一拍 / 指定人 / 任意消息 / 概率 / 定时）。

### 2.2 唤醒与提示词装配

`sendWakePromptV2(key, reason)` → `buildWakePromptV2(key, reason)` 拼出一整段提示词，
`deliverPromptNow()` 交给 DSH `session.prompt`。`reason` 决定尾段指令
（`replyCheck` / `careCheck` / `timeBubble` / `proactiveCheck` / `reminder` / `selfReview` / `memoryWrite` / `newFriend` / 普通唤醒…）。

### 2.3 AI 干活

AI 通过 MCP 工具（`mcp-snowluma-safe.js`）调 bridge HTTP：看未读、等消息、发消息、发表情、拍一拍、
记记忆、查黑话、看转发、发语音……桥接侧做鉴权（`x-console-token` + `x-agent-token`）、限频、白名单校验、内容过滤。

### 2.4 发消息

`/api/socialV2/send-message` 等 → 发送队列（顺序发送 + 拟人间隔 + 每分钟/每小时上限）
→ SnowLuma `send_msg` → QQ。发完 `recordSentMessagesV2()` 写入 `recentMessages`（`isSelf:true`）、更新 `lastAiReplyAt`，
并按需安排「回复检查」唤醒。

### 2.5 收尾与看门狗

- **沉睡前闸门**：设潜水/标已读前必须 `qq_wait_for_messages(timeoutMs=…)` 等满观察窗口；
  返回 `canSleepNow=true` 才允许收尾（防「回一句就消失」和「假观察」）。
- **看门狗**（`startConnectionWatchdog`，每 30 秒一轮）：
  - 回合卡死：按**最近一次回合事件**计时，20 分钟无事件才退役会话（**本期改过**：以前按回合开始 6 分钟，长工具链会被误杀）；
  - SnowLuma WS 假死：90 秒没包强制重连；
  - DSH events.mux 10 分钟没帧重连；
  - 退役时保留 pendingWake，避免「重启后没人叫」。
- **社交循环** `socialLoopTick`（5 秒）：定时唤醒、主动机会、时间冒泡、日程提醒、宵禁/静音判定。

---

## 3. 提示词装配顺序（组件化的核心）

`buildWakePromptV2` 的 base 顺序（前面＝更显眼）：

```
adminDevLine        # 管理端开发模式（仅 owner 私聊，给本地工具说明）
privateReplyLine    # 私聊必回
mutedClearLine      # 刚解除静音
moodLine            # 心情（含恢复期/被叫回来）
crossSessionLine    # 别处听来的（旧版：仅性格标签，最多 8 条）
profileLine         # 【本期新增】全局用户画像（完整 + 可分享两层）
persistMemoryLine   # 持久化记忆（state/memory/*.md，整段注入）
midTermLine         # 中期记忆（tasks-*.md，qq_task_note）
memoryTaxonomyLine  # 三段记忆体系说明（仅管理端）
pendingReminderLine # 到点日程
roleLine / identityLine / tokenLine / initialPromptLine
antiAiLine          # 反 AI 味 + 主动关心
proactiveLine       # 积极性
stickerLine         # 表情策略 + 本轮发不发 + 可用表情
stickerPickLine     # 【本期新增】表情候选 top3（按语境打分）
styleLine           # 条数与风格（软指导）
replyShapeLine      # 【本期新增】本轮节奏（硬上限 1/2/3 条）
driveLine           # 【本期新增】会话推进（追问 / 起新话题）
proactiveReplyLine / statusLine / wakeLineNow
memoryLine / memoryRuleLine / quoteLine / participationLine / preSleepLine / timeSenseLine
```

要点：**能算出来的都别让模型自由发挥**。心情、条数、表情候选、追问/新话题、语气反馈，
都在桥接里先判定，再用一句话的形式写进 prompt；模型只负责「怎么说」。

---

## 4. 本期新增的四个组件

| 组件 | 输入 | 判定 | 产物 | 配置键 |
| --- | --- | --- | --- | --- |
| `conversation-drive.js` | 未读/最近消息、上一次引导时间、activeTopics | 有来信 → 追问（8 分钟冷却，刚被回答过就不追问）；冷场或对方明显收尾（嗯/睡了/不用了）→ 起新话题（45 分钟冷却、每小时最多 2 次），话题优先取没聊完的 activeTopic，其次内置种子池 | `【会话推进｜往下追一句】/【起个新话题】` | `socialV2.conversationDrive.*` |
| `reply-shape.js` | 最后一条来信、心情、近 2 分钟自己发过几条 | 正事/情绪低落/长消息 → 1 条；轻松闲聊 → 最多 3 条；心情低或刚连发 → 压到 1 条 | `【本轮节奏】…最多 N 条` | `socialV2.replyShape.*`（条数 1~3 归一化） |
| `sticker-picker.js` | 收藏表情库、来信文本、最近发过的表情 | 语境关键词（吃/白饭/累/生气/夸/哭/告别…）命中 tags 加分；本体系列加分；久未使用加分；30 分钟内发过的重罚；无备注降权 | `【表情候选】top3 + 理由`，正事话题直接劝退 | 走 `socialV2.sticker.*` |
| `user-profile.js` | 收消息（身份）、AI 写的群友印象 | 完整层：谁、在哪些会话、互动次数、备注；可分享层：只留脱敏后的趣事（QQ/微信/电话/地址/密码/邮箱、5 位以上数字直接拒） | `【本会话用户画像】` + `【别处听来的】` | 文件 `state/user-profiles.json`，接口 `/api/socialV2/user-profiles` |

观测方式：`GET /api/socialV2/prompt?key=…` 会回显 `conversationDrive / replyShape / stickerPick` 的**实际判定结果**，
不用猜模型这轮收到了什么。

---

## 5. 这两天其它改动（非组件层，但影响行为）

- **看门狗**：从「回合开始 6 分钟」改成「最近事件 20 分钟」，解决长工具链被误杀；退役保留/重放 pendingWake。
- **传话**：任何白名单私聊用户用自己的令牌就能给别的白名单会话发（每小时上限 20 条），不再弹 owner 审批；群会话不能发起传话。
- **feedback**：免审批，但先过 `content-guard`（注入中和隔离、违规拒收、长度/条数上限、防挤爆上下文）；六小时自检也用同一套闸门。
- **中期记忆**：`qq_task_note` 读写 `state/memory/tasks-*.md`，跨上下文保留进度。
- **全局画像**：把旧持久记忆（`state/memory/*.md` 的【用户画像】）和 `social-v2.json` 的 `memberImpressions` 迁移合并成一份跨会话画像。
- **管理端开发模式**：owner 私聊下权限升级（本地 pwsh/文件/浏览器/发文件），但凭据、越权、系统目录仍然拒绝。
- **控制台**：social-v2 页扩了心情、表情、活动、日记、组件与记忆相关配置（`.bak-*` 里能看到这几轮的迭代）。

---

## 6. 数据与记忆分层

| 层 | 位置 | 内容 | 生命周期 |
| --- | --- | --- | --- |
| 会话状态 | `state/social-v2.json` | 每会话：未读/最近消息、唤醒配置、心情、最近表情、轻量记忆（话题/想法/印象）、日程、驱动冷却、token | 长期，随会话重置清空 |
| 中期记忆 | `state/memory/tasks-*.md` | 多步任务进度（完成/待办/发现） | 跨上下文保留 |
| 长期记忆 | `state/memory/private_*.md`、`group_*.md` | 客观陈述 / 重要信息 / 用户画像 / 日记 | 跨会话保留，定期整体重写 |
| 全局画像 | `state/user-profiles.json` | 用户身份、会话分布、互动次数、备注（含可分享标记） | 全局，跨会话/跨群 |
| 表情库 | `state/stickers*.json` | 收藏表情、备注、标签、使用次数 | 长期 |
| 黑话库 | `state/slang*.json` | 候选 + 已确认词条 | 长期 |
| Token 账本 | `state/tokens*.json` | 每轮用量/价格/白饭换算 | 长期 |
| 日志 | `state/bridge.log`、`state/qq-activity.log` | 运行日志、工具调用 | 轮转 |

> 注意：桥接会**缓存** `user-profiles.json` 在内存里，外部脚本改完必须重启桥接，否则会被内存里的旧副本覆盖。

---

## 7. 安全与权限

- **白名单**：`config.json` 的 `allow.groups` / `allow.private`，不在名单直接拒。
- **控制台令牌**：所有 HTTP 请求要 `?token=` 或 `x-console-token`；Host 头只允许回环，防 DNS rebinding。
- **会话令牌**：二代工具的每次调用要带 `x-agent-token`，且必须命中活跃会话；空令牌一律拒。
- **内容闸门**：外来的 feedback/传话/日志派生文本在进提示词前做注入中和、违规拦截、长度与条数上限。
- **画像脱敏**：可分享层硬过滤联系方式、证件、5 位以上数字串；跨用户只讲趣事，禁止暴露来源。
- **敏感信息**：`sensitive.js` + 出站拦截，令牌/密码类不落提示词、不外发。
- **运行环境**：`state/` 的 ACL 收紧（Windows 需管理员权限，失败只告警不阻断）；工具调用走审批/sandbox，管理端模式自动通过属于 owner 的写操作。
- **社交侧**：宵禁、静音、被凶后掉心情、看门狗退役防「永眠」、沉睡前闸门防「刷完就跑」。

---

## 8. 接口速查（本地控制台）

| 类别 | 端点 |
| --- | --- |
| 观察 | `/api/socialV2/prompt` `/state` `/unread` `/recent` `/activity` `/tool-log` `/user-profiles` |
| 发送 | `/api/socialV2/send-message` `/send-burst` `/send-sticker` `/send-poke` `/send-voice` `/send-file` `/reply` |
| 等待/收尾 | `/api/socialV2/wait` `/mark-read` `/wake-config` |
| 记忆 | `/api/socialV2/memory` `/memory-append` `/memory-update` `/memory-remove` `/task-notes` `/persistent-memory` |
| 表情/黑话/语音 | `/sticker-list` `/sticker-note` `/slang/query` `/slang/submit` `/voices` |
| 运维 | `/api/restart` `/api/sessions` `/api/session/reset` `/api/mode` `/api/security` `/api/whitelist` `/api/tokens/*` |

MCP 工具名与端点一一对应，例如 `qq_send_message` → `/api/socialV2/send-message`，
`qq_wait_for_messages` → `/api/socialV2/wait`；`socialV2.tools.*` 为 `false` 时该工具不注册。

---

## 9. 配置结构（`config.json`）

顶层：`dsh`、`role`、`snowluma`、`ownerQQ`、`sessionCwd`、`agentPreset`、`workspaceTitle`、`allow`/`deny`（白名单）、`consolePort`/`consoleToken`、`pricing`、`security`、`slang`、`social`、`socialV2`、`webSearch`。

`socialV2` 关键段：

| 段 | 作用 |
| --- | --- |
| `tools` | 逐个工具开关 |
| `wake` | 唤醒/潜水/沉睡前观察/频率上限 |
| `send` | 分条、间隔、限频、单条字数 |
| `wait` | 等待与静默 |
| `sticker` | 表情总开关、发送概率、冷却、收藏限频 |
| `mood` | 心情初值、衰减、奖惩、阈值 |
| `context` | 快照条数/字符上限 |
| `proactive` / `timeBubbles` / `startupGreeting` / `readReceipt` | 主动机会、时间冒泡、开机问候、已读回执 |
| **`conversationDrive`** | **本期新增** 追问/新话题：概率、冷却、每小时上限、话题种子 |
| **`replyShape`** | **本期新增** 本轮回几条：普通/闲聊/正事上限、长消息阈值 |
| `crossSessionMemory` | 旧版跨会话标签分享（画像组件的降级路径） |
| `guard` / `feedback` | 内容闸门、反馈 |

---

## 10. 启动、运维与验证

- **启动**：`启动大肥鱼.bat` / `start-feiyu.bat`（守护循环，进程退出 5 秒后自动拉起）。
- **重启桥接**：控制台 `POST /api/restart?token=<state/console-token>`（会先落盘再退出，由守护窗口拉起）。
  直接 kill node 也行，但提权进程普通 shell 可能杀不掉。
- **改代码**：改完先 `node --check src/xxx.js`；涉及主程序的用最小补丁 + 精确字符串替换，避免并发写坏文件。
- **自测**：`npm run test:audit`（离线回归）、`npm run test:token`、`npm run test:stickers`、`npm run test:voice`、
  `npm run verify:adaptation`、`npm run self-test`。
- **升级 DSH 后**：`npm run scan:tool-names`（工具名单对账）、`npm run verify:adaptation`、必要时重装 preset 并重启 DSH。

---

## 11. 插件体系（万态皆插件）

> 原则：**所有能力都做成可独立插拔、独立优化的组件**；没有结构化字段也行，用一份 skill.md 描述自己，
> 按时间或按需被调用，也能反过来叫 AI —— 而不是用规则脚本硬抽。

### 11.1 宿主

`src/plugin-host.js`：扫描 `plugins/qq-components/<id>/`，读 `plugin.json` + `index.js`（+ `skill.md`），
加载失败只告警、不影响桥接。给插件的 API 都是受限的：

| API | 作用 |
| --- | --- |
| `ctx.state.get()/set()` | 插件自己的持久状态（`state/plugins/<id>.json`） |
| `ctx.log/warn` | 日志 |
| `ctx.addPromptBlock(text)` | 往下一轮提示词里加一段（宿主统一拼接） |
| `ctx.askAI(prompt, { key })` | **反过来叫 AI**：排队，社交循环下个 tick 投递给指定会话 |
| `ctx.registerTool(name, { handler })` | 暴露自定义工具（走 `/api/plugins/call`） |

钩子：`onIncoming`（每次来信）、`beforePrompt`（拼唤醒提示词前）、`afterSend`（发送成功后）、
`onTick`（按 `plugin.json` 的 `schedule.everyMs` 定时）。

### 11.2 已迁移的插件（`plugins/qq-components/`）

| 插件 | 分类 | 钩子 | 干什么 |
| --- | --- | --- | --- |
| `ctx-memory-profile-store` | 记忆 | onIncoming / beforePrompt | 全局用户画像：收消息记身份，拼提示词时输出「本会话完整 + 别处听来的」；工具 `profile_record_note / profile_record_facts / profile_snapshot` |
| `ctx-memory-profile-facts` | 记忆 | onIncoming / beforePrompt / onTick | 攒来信素材、控频率，把素材与字段口径写进提示词，由 AI 判断后落库 |
| `ctx-chat-topic-drive` | 对话质量 | beforePrompt | 要不要追问一句 / 冷场起新话题（冷却 + 概率） |
| `ctx-chat-reply-shape` | 对话质量 | beforePrompt | 这一轮最多几条（正事 1 / 普通 2 / 闲聊 3） |
| `ctx-media-sticker-pick` | 表达 | beforePrompt | 按语境给表情候选 top3，正事劝退 |
| `life-proactive-time-bubble` | 主动行为 | beforePrompt | 时间冒泡文案要求（每天上限 4 次），桥接只负责到点唤醒与收尾 |
| `life-proactive-startup-greeting` | 主动行为 | beforePrompt | 开机起床话口径（刚睡醒，不是回复谁） |
| `ctx-memory-update` | 记忆 | beforePrompt | 定期重写持久记忆/日记（只写记忆，不发 QQ） |
| `obs-self-review` | 自我迭代 | beforePrompt | 6 小时自查 + 按建议动手：只动功能/代码/配置，不碰记忆文件 |

桥接里原来的内联实现已删除，`buildWakePromptV2` 只调用 `pluginHost.collectPromptBlocks(...)`，
把这些插件段落统一插进提示词（位置在持久化记忆之前、风格段之后）。

### 11.3 插件管理

- 页面：`/api/plugins/page?token=…`（源码 `public/plugins.html`，独立页面，不依赖控制台其它组件）。
- 接口：`GET /api/plugins`（清单/分类/警告）、`GET /api/plugins/detail?id=`（含 skill.md、配置、状态）、
  `POST /api/plugins/toggle`（启停，写 `state/plugins/registry.json` 并热重载）、
  `POST /api/plugins/reload`、`POST /api/plugins/order`（排序）、`GET /api/plugins/skill/<id>`。
- 约定：插件目录自带 `plugin.json`（id/name/version/description/category/order/tags/hooks/config）
  + `index.js` + `skill.md`；加一个插件只要新建目录，不用改桥接。

### 11.4 第一个插件：`ctx-memory-profile-facts`

- 位置：`plugins/qq-components/profile-facts/`（`plugin.json` / `index.js` / `skill.md`）。
- 只做三件事：攒来信素材（有界）、每 10 分钟最多问一次、把素材 + 字段口径写进提示词。
- 判断交给 AI：`qq_memory_append(category="memberImpression", …)` 落库，桥接再同步进全局画像。
- 之前那版**正则抽取脚本已删除**（不符合「别用规则脚本硬抽」的要求）。

### 11.5 还剩哪些可以继续插件化

| 现状 | 目标插件 | skill 里要写清 |
| --- | --- | --- |
| 心情 `moodCfgV2` | `mood` | 涨落规则、恢复期 |


迁移方式统一：插件 `beforePrompt` 只产出**一段要求**，判定数据仍可从桥接状态读；
需要跨会话或定时动作的用 `askAI`；每个插件都配 `skill.md`，说明「什么时候被调用、输入输出、边界、怎么调」。

---

## 12. 已知限制 / 下一步可组件化

1. **手打 emoji 与颜文字**仍是提示词软约束（只有「发不发表情包/发哪张」是组件）——可做装饰组件：按语境给 1~2 个候选，严肃话题禁用。
2. **记忆抽取**（`memoryWrite`）还是一次性总结，事实/日程/偏好没有规则抽取。
3. **日记与自我更新**靠提示词自省，容易越改越野；可收敛成固定检查清单 + 只允许改配置/备份。
4. **时间冒泡、开业问候**文案仍由模型现写，可改成模板池 + 轮换。
5. **画像昵称**：私聊事件里 `sender` 是「私聊」，取不到真实昵称，只能靠「名字（QQ号）」映射补。
6. **组件的效果没有闭环统计**（追问后对方是否接着聊、起话题后是否冷场），没法自动调参。
7. `bridge.js` 仍是 13,000+ 行单体，控制台 `console.html` 也很大；后续可把「唤醒装配 / 发送队列 / 控制台路由」拆出去。
