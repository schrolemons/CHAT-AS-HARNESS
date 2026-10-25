// 开机起床问候插件：桥接启动触发 reason=startupGreeting，文案要求由本插件产出。

export function createPlugin(ctx) {
  const cfg = ctx.config || {};
  return {
    hooks: {
      beforePrompt(payload) {
        if (String(payload?.reason || '') !== 'startupGreeting') return '';
        const st = payload?.st || {};
        const where = String(payload?.key || '').startsWith('group:') ? '群里' : '私聊里';
        const unread = Array.isArray(st.unread) ? st.unread.length : 0;
        const hint = String(cfg.hint || '刚开机算刚睡醒：早安、睡过头了、我的早饭呢').slice(0, 60);
        return [
          `【本轮开机起床｜${where}】桥接刚启动，你现在等于刚睡醒。`,
          `主动去${where}冒一句起床话（可用角度：${hint}）。`,
          '你在主动开口，不是在回复谁：换个说法别每次一样；不要接旧话题，不要用「你刚才/你按/你说」这种接话句式，也不要说「系统提示/我刚开机/桥接启动」这类词。',
          unread > 0 ? `注意：这里确实有 ${unread} 条未读，先正常回应它们，再补起床话。` : '1 条就够，轻松场合可以再配 1 张表情包。',
          '收尾按正常潜水规则。'
        ].join('\n');
      }
    }
  };
}
