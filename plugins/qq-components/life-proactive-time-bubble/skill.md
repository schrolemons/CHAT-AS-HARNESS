# skill：时间冒泡（time-bubble）

## 它解决什么
桥接会在固定时间点（午饭、起床、深夜…）安排一次「主动开口」，但文案以前写死在主程序里。
现在由本插件负责「这一轮该怎么冒泡」，桥接只负责到点唤醒和收尾。

## 什么时候被调用
`beforePrompt` 且 `reason === "timeBubble"`：桥接已经把 `pendingTimeBubble = { label, hint }` 准备好。

## 产出
一段【本轮时间冒泡｜午饭点】要求：直接发一句自然的时间梗，不接旧话题、不用接话句式、1 条就够。
每天最多 `config.maxBubblesPerDay` 条（状态存在 `state/plugins/time-bubble.json`）。

## 边界
- 不自己发消息，也不改唤醒计划（那是桥接的调度）。
- 没有 `pendingTimeBubble`（或当天额度用完）就什么都不产出，这一轮自然收尾。
