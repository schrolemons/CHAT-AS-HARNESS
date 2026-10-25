// 全局用户画像插件：把 user-profile.js 的存储与注入从桥接主程序搬进插件目录。
//
// 桥接只做两件事：收消息时 emitIncoming（插件自己记身份），拼提示词时 collectPromptBlocks。
// 其它模块（比如记忆落库）通过插件工具调用写入，避免第二份内存缓存互相覆盖。

import path from 'node:path';
import { createUserProfileStore } from '../../../src/user-profile.js';

const BAD_NAMES = new Set(['私聊', '群聊', '我']);

const NON_CHAT_REASONS = /^(selfReview|selfOptimize|memoryWrite|timeBubble|startupGreeting|reminder|newFriend|newsShare|careCheck|idleRescue|proactiveCheck|replyCheck)/;

export function createPlugin(ctx) {
  const cfg = ctx.config || {};
  const store = createUserProfileStore({ file: path.join(ctx.root, 'state', 'user-profiles.json'), logger: ctx.log });

  function cleanName(name) {
    const n = String(name || '').trim();
    return BAD_NAMES.has(n) ? '' : n;
  }

  ctx.registerTool('profile_record_note', {
    description: '给某个用户记一条画像备注（自动脱敏决定能不能跨会话分享）',
    handler: ({ userId, name, trait, key, at } = {}) => {
      const shareable = store.recordNote({ userId, name: cleanName(name), trait, key, at });
      return { ok: true, shareable };
    }
  });
  ctx.registerTool('profile_record_facts', {
    description: '写入结构化画像字段：{ aliases, likes, dislikes, recents, quotes }',
    handler: ({ userId, name, key, at, facts } = {}) => {
      const changed = store.recordFacts({ userId, name: cleanName(name), key, at, facts });
      return { ok: true, changed };
    }
  });
  ctx.registerTool('profile_snapshot', {
    description: '查看完整用户画像（管理端用）',
    handler: () => store.snapshot()
  });

  return {
    hooks: {
      onIncoming(payload) {
        const text = String(payload?.text ?? '');
        if (!text) return;
        try {
          store.recordContact({
            userId: payload?.userId,
            name: cleanName(payload?.sender),
            key: payload?.key,
            at: payload?.at,
            isOwner: !!payload?.isOwner
          });
        } catch (error) { ctx.warn('recordContact 失败: ' + (error?.message ?? error)); }
      },
      beforePrompt(payload) {
        if (payload?.reason && NON_CHAT_REASONS.test(String(payload.reason))) return '';
        const st = payload?.st;
        const participants = [];
        const key = String(payload?.key || '');
        const lastIncoming = [...(Array.isArray(st?.recentMessages) ? st.recentMessages : [])].reverse().find((m) => m && !m.isSelf);
        if (lastIncoming) {
          if (lastIncoming.userId) participants.push(lastIncoming.userId);
          if (lastIncoming.sender) participants.push(lastIncoming.sender);
        }
        if (key.startsWith('private:')) participants.push(key.slice(8));
        const block = store.blockFor({ participants, maxShare: Number(cfg.maxShare) || 3 });
        return block && block.text ? block.text : '';
      }
    }
  };
}
