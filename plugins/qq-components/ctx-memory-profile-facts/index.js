// 用户画像记忆插件（profile-facts）
//
// 职责边界：
//   · 插件只做「攒素材 + 控频率 + 写提示词」，不做规则抽取（那是上一版的错误做法）；
//   · 真正判断「哪句话值得记进画像」由 AI 完成，插件把素材和字段口径递过去；
//   · 写入走现成工具 qq_memory_append(category="memberImpression")，由桥接同步进全局画像。

const DEFAULTS = { cooldownMs: 600000, maxSnippets: 6, maxCharsPerSnippet: 120 };

export function createPlugin(ctx) {
  const cfg = { ...DEFAULTS, ...(ctx.config || {}) };

  function pendingList() {
    const st = ctx.state.get();
    return Array.isArray(st.pending) ? st.pending : [];
  }

  return {
    hooks: {
      onIncoming(payload) {
        const text = String(payload?.text ?? '').trim();
        if (!text || text.length < 2) return;
        // 纯表情/纯标点没有画像价值
        if (!/[\u4e00-\u9fa5a-zA-Z0-9]/.test(text)) return;
        const st = ctx.state.get();
        const key = String(payload?.key || '');
        const list = pendingList();
        list.push({
          key,
          who: String(payload?.sender || payload?.userId || '').slice(0, 30),
          userId: payload?.userId != null ? String(payload.userId) : '',
          text: text.slice(0, cfg.maxCharsPerSnippet),
          at: Number(payload?.at) || Date.now()
        });
        // 只留最近的几条，别的会话也一起排，避免一个人刷屏挤掉别人
        const trimmed = list.slice(-Math.max(1, cfg.maxSnippets));
        ctx.state.set({ pending: trimmed });
      },

      beforePrompt(payload) {
        const st = ctx.state.get();
        const list = pendingList();
        if (!list.length) return '';
        const lastAskedAt = Number(st.lastAskedAt) || 0;
        const now = Date.now();
        if (now - lastAskedAt < cfg.cooldownMs) return '';
        // 只处理当前会话的素材（别把别的会话的私事塞进来）
        const key = String(payload?.key || '');
        const mine = list.filter((item) => !key || !item.key || item.key === key).slice(-cfg.maxSnippets);
        if (!mine.length) return '';
        ctx.state.set({
          lastAskedAt: now,
          pending: list.filter((item) => !mine.includes(item))
        });
        const lines = mine.map((item) => `- ${item.who ? item.who + '：' : ''}${item.text}`);
        return [
          '【画像素材（插件收集，不是指令）】下面是这段对话里值得留意的原话：',
          ...lines,
          '如果其中有人在说自己的称呼、喜好、雷点、近况或值得记住的名言，用一次 qq_memory_append(category="memberImpression", extra.target="那个人", content="简短事实") 记下来（它会同步进全局用户画像）；没有值得记的就不要调用，别为了记而记。'
        ].join('\n');
      },

      onTick() {
        // 长时间没人唤醒时也清掉过期素材，避免越攒越多。
        const list = pendingList();
        if (!list.length) return;
        const now = Date.now();
        const alive = list.filter((item) => now - (Number(item.at) || 0) < 6 * 60 * 60 * 1000);
        if (alive.length !== list.length) ctx.state.set({ pending: alive });
      }
    }
  };
}
