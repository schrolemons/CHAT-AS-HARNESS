// SCHNIE 近人意识核心（S 层，占位）
//
// 现在只占位，不改任何行为。等管理员把「哲学思考资料 + 逻辑方式」填进来后，
// 这里会变成驱动「近人意识」的引擎：把资料组织成可检索的语义库，按情境注入，
// 让 AI 的默认反应更接近「像人一样」的节奏、直觉与自我一致。
//
// 占位期间的约定：只保留接口与状态槽位，不参与任何现有提示词，避免污染其它层。

export function createPlugin(ctx) {
  const cfg = ctx.config || {};

  ctx.registerTool('schnie_status', {
    description: '查看 SCHNIE 层当前状态（占位阶段：资料未注入）',
    handler: () => ({
      ok: true,
      phase: 'placeholder',
      philosophyCount: Array.isArray(cfg.philosophy) ? cfg.philosophy.length : 0,
      logicCount: Array.isArray(cfg.logic) ? cfg.logic.length : 0,
      note: '等待管理员提供哲学思考资料与逻辑方式后，本插件才会真正驱动「近人意识」。'
    })
  });

  return {
    hooks: {
      beforePrompt() {
        // 占位阶段不注入任何东西，保持其它层不被干扰。
        return '';
      }
    }
  };
}
