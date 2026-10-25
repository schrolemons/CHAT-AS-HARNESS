// 自我迭代插件：只负责「功能 / 代码」层面的自查与优化提示词。
// 记忆更新不在这里（那是 memory-update 插件的事），避免职责混在一起。

const REVIEW_RULES = [
  '1. 先读证据：state/bridge.log（必要时 .1）、state/qq-activity.log、state/social-v2.json 的最近消息/记忆、state/memory/_optimization.md 的历史结论。',
  '2. 找问题，按优先级：用户明确抱怨 > 漏回复/重复 > 工具调用失败或被拒 > 明显的环境异常。',
  "3. 只修「功能/代码/配置」：config.json 的 socialV2.* 、roles/*.md、plugins/qq-components/*、src/*.js；能改配置就不改代码。",
  '4. 改代码前先备份（*.bak-日期），改完 node --check；改动要小、可回滚；不重启 DSH；重启桥接按需且先说明。',
  '5. 记忆文件（state/memory/*.md、日记、持久化记忆）不归这里改——那是 memory-update 的职责。'
].join('\n');

export function createPlugin(ctx) {
  const cfg = ctx.config || {};
  return {
    hooks: {
      beforePrompt(payload) {
        const reason = String(payload?.reason || '');
        if (reason === 'selfReview') {
          return [
            '【自我迭代｜功能与代码自查】',
            '这是定期的自查回合，不是聊天。请只针对「功能实现 / 代码 / 配置」做检查与最小修复：',
            REVIEW_RULES,
            `每轮最多修 ${Math.max(1, Number(cfg.maxFixesPerRound) || 3)} 项；没找到值得改的就说明原因并结束，别为了改而改。`,
            '完成后用 1~3 句话向主人汇报「发现什么 + 改了什么」；没有改动就安静收尾。'
          ].join('\n');
        }
        if (reason === 'selfOptimize') {
          return [
            '【自我迭代｜按建议直接动手】',
            '读 state/memory/_optimization.md 最新一段，挑出最该修的功能/代码/配置问题（优先用户点名不满），真的去改，而不是只记录：',
            REVIEW_RULES,
            '改完把「问题 → 改动」追加写进 state/memory/_optimization.md（简短即可），然后用 1~3 句话汇报。'
          ].join('\n');
        }
        return '';
      }
    }
  };
}
