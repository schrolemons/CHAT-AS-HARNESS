# skill：自我迭代（self-review）

## 它解决什么
桥接每隔一段时间让 AI 回头看看自己哪里做得不好。以前这段提示词写死在主程序里，
现在由插件负责：检查清单、改动边界、汇报口径都在这里。

## 什么时候被调用
`beforePrompt` 且 `reason` 是：
- `selfReview`：定期自查（默认 6 小时一次）。
- `selfOptimize`：拿到自查结论后，按建议直接修。

## 只做什么
- 对话质量：漏回复、重复、称呼错、表情过多、语气不对。
- 工具调用：失败、被拒、误用。
- 环境执行：桥接/DSH/QQ/浏览器/计划任务/日志异常。
- 修的是**功能、代码、配置**；改代码先备份、`node --check`、最小可回滚。

## 不做什么
- 不改记忆文件（`state/memory/*.md`、日记、持久化记忆）——那是 `memory-update` 插件。
- 不重启 DSH；不碰与桥接无关的系统目录；不为改而改。

## 配置
`config.intervalHours` 仅作说明口径（真实定时在桥接 `socialV2.selfReview.intervalHours`）；
`config.maxFixesPerRound` 控制单轮最多修几项。
