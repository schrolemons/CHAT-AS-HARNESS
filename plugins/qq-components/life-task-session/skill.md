# life-task-session — 任务委派会话（L 层）

## 是什么
大肥鱼（QQ 里的机器人）可以把任务「丢」给 DSH 里的一个独立任务会话：
- 会话挂在 DSH 的「大肥鱼任务」工作区，**主人在界面上一眼能看到**；
- 任务会话用 `qq-task-worker` preset（本地工具 pwsh/文件读写/搜索/后台任务 + 联网检索，无 QQ 工具），自己拆步骤、干活；
- 需要主人拍板时，任务会话**直接在会话里提问**，主人在界面回答（询问-回答，全程可见）；
- 任务会话的汇报以 `[任务完成]` 标记结尾，桥接捕获后**唤醒发起会话**：大肥鱼用 `task_result` 取结果，再自然地向主人转达（跟进任务 → 输入输出 → 反馈结果）。

## 工具（仅管理员/主人会话可用，桥接按会话令牌校验）
- `task_spawn(token, title, task)`：开一个任务会话，返回 `{taskId, sessionId, workspace, hint}`。
- `task_list(token)`：任务列表（id/标题/状态/时间/结果预览）。
- `task_result(token, taskId)`：取单个任务的状态与结果。

## 状态机
- `running`：任务会话在跑（可能多轮：它提问、主人回答、继续干）。
- `done`：某轮汇报里出现 `[任务完成]` 标记 → 桥接标记完成并唤醒发起会话转达。
- `failed`：回合以 error/aborted 结束。

## 安全
- 只有主人（owner 私聊）的会话令牌能 spawn/list/result；群聊与其它私聊一律 403。
- 任务会话没有 QQ 发送工具、没有 QQ 会话令牌，发不出 QQ 消息。
- 并发上限与总任务数上限由桥接控制（默认 3 并发 / 20 总数，超出自动拒绝或裁最旧）。

## 与其它组件的关系
- 执行面：`dsh/agent-presets/qq-task-worker`（由 setup-dsh.mjs 注册到 DSH profile）。
- 桥接侧机制：任务注册表 `state/tasks.json`、事件流跟随、回合结束捕获、`taskDone` 唤醒原因。
- 管理端：`GET /api/tasks`（控制台令牌）查看任务注册表。
