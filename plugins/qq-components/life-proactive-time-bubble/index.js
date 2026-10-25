// 时间冒泡插件：桥接到点会用它设置的 pendingTimeBubble 唤醒，
// 插件把那一条「冒泡要求」写进提示词，桥接只负责收尾。

export function createPlugin(ctx) {
  const cfg = ctx.config || {};
  return {
    hooks: {
      beforePrompt(payload) {
        if (payload?.reason !== 'timeBubble') return '';
        const st = payload?.st;
        if (!st) return '';
        const tb = st.pendingTimeBubble && typeof st.pendingTimeBubble === 'object' ? st.pendingTimeBubble : {};
        st.pendingTimeBubble = null;
        const label = String(tb.label || '这个时间点').slice(0, 20);
        const hint = String(tb.hint || '').slice(0, 60);
        const where = String(payload?.key || '').startsWith('group:') ? '群里' : '私聊里';
        // 每天最多几条（插件自己的状态里记）
        const state = ctx.state.get();
        const today = new Date().toISOString().slice(0, 10);
        const count = state.day === today ? Number(state.count) || 0 : 0;
        const maxPerDay = Math.max(1, Number(cfg.maxBubblesPerDay) || 4);
        if (count >= maxPerDay) return '';
        ctx.state.set({ day: today, count: count + 1 });
        return [
          `【本轮时间冒泡｜${label}】现在到了${label}${hint ? '（' + hint + '）' : ''}。`,
          `你在主动开口，不是在回复谁：直接${where}发一句自然的时间梗冒泡（举个例：咚咚咚吃白饭了 / 起早上班赚 token / 该睡了别熬）。`,
          '要求：换个说法别每次一样；不要接旧话题，不要用“你刚才/你按/你说”这种接话句式；1 条就够，轻松场合可配 1 张表情。'
        ].join('\n');
      }
    }
  };
}
