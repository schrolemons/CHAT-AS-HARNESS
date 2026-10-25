// 回复形态插件：把 reply-shape.js 的判定搬进插件目录，桥接只负责把上下文递过来。

import { planReplyShape } from '../../../src/reply-shape.js';

const NON_CHAT_REASONS = /^(selfReview|selfOptimize|memoryWrite|timeBubble|startupGreeting|reminder|newFriend|newsShare|careCheck|idleRescue|proactiveCheck|replyCheck)/;

export function createPlugin(ctx) {
  const cfg = ctx.config || {};
  return {
    hooks: {
      beforePrompt(payload) {
        if (payload?.reason && NON_CHAT_REASONS.test(String(payload.reason))) return '';
        const plan = planReplyShape({
          state: payload?.st,
          incomingText: payload?.incomingText || '',
          mood: payload?.mood,
          moodLowThreshold: payload?.moodLowThreshold,
          config: cfg,
          now: Date.now()
        });
        if (!plan || !plan.line) return '';
        ctx.state.set({ last: { kind: plan.kind, maxMessages: plan.maxMessages, at: Date.now() } });
        return plan.line;
      }
    }
  };
}
