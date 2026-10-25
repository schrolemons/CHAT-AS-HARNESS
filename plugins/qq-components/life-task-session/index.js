// life-task-session（L 层｜任务委派会话）
//
// 让大肥鱼能把「需要独立完成的任务」丢给 DSH 里的一个**独立任务会话**：
//   · 会话挂在 DSH 的「大肥鱼任务」工作区，主人在界面上可见；
//   · 任务会话用 qq-task-worker preset（本地工具 + 联网，无 QQ 工具），自己干活、
//     需要时直接在会话里提问（主人在界面回答）；
//   · 任务结束（汇报带 [任务完成] 标记）后，桥接把结果写回注册表并唤醒发起会话，
//     大肥鱼用 task_result 取结果、自然地向主人转达。
//
// 本插件只做三件事：声明工具（转调桥接注入的 capabilities）、给主人会话注入用法提示、
// 提供 skill.md 说明。真正创建会话/跟随事件/捕获结果的机制在桥接里（环境管理）。
export function createPlugin(ctx) {
  const ownerKey = 'private:' + String(ctx.manifest?.config?.ownerQQ ?? '');

  const need = (input) => {
    const token = String(input?.token ?? '').trim();
    if (!token) throw new Error('缺少会话令牌 token（见唤醒提示中的【会话令牌】）');
    return token;
  };

  ctx.registerTool('task_spawn', {
    description: '在 DSH 里启动一个独立任务会话（qq-task-worker，用户在界面可见）：把需要长时间、多步骤、或要独立完成的任务丢给它；它自己干活、需要时在会话里向主人提问；完成后桥接会唤醒你，你用 task_result 取结果再向主人汇报。仅管理员（主人）会话可用。',
    schema: {
      token: { type: 'string', description: '你的会话令牌（见唤醒提示中的【会话令牌】）' },
      title: { type: 'string', description: '任务标题（会显示在 DSH 工作区里，简短）' },
      task: { type: 'string', description: '任务说明：目标、背景、约束、期望产物，写清楚一点' }
    },
    handler: async (input) => {
      const token = need(input);
      const title = String(input?.title ?? '').trim().slice(0, 80) || '未命名任务';
      const task = String(input?.task ?? '').trim();
      if (!task) throw new Error('task 不能为空');
      const cap = ctx.capabilities;
      if (!cap || typeof cap.taskSpawn !== 'function') throw new Error('桥接未提供任务会话能力（capabilities.taskSpawn）');
      return cap.taskSpawn({ token, title, task });
    }
  });

  ctx.registerTool('task_list', {
    description: '列出你（管理员会话）启动过的任务会话：id、标题、状态（running/done/failed）、创建时间与结果预览。仅管理员（主人）会话可用。',
    schema: { token: { type: 'string', description: '你的会话令牌' } },
    handler: async (input) => {
      const token = need(input);
      const cap = ctx.capabilities;
      if (!cap || typeof cap.taskList !== 'function') throw new Error('桥接未提供任务会话能力（capabilities.taskList）');
      return cap.taskList({ token });
    }
  });

  ctx.registerTool('task_result', {
    description: '取某个任务会话的结果：status（running/done/failed）、汇报文本或错误信息。任务会话结束（带 [任务完成] 标记）后调用它，然后把结果自然地向主人转达。仅管理员（主人）会话可用。',
    schema: {
      token: { type: 'string', description: '你的会话令牌' },
      taskId: { type: 'string', description: 'task_spawn 返回的 taskId' }
    },
    handler: async (input) => {
      const token = need(input);
      const taskId = String(input?.taskId ?? '').trim();
      if (!taskId) throw new Error('taskId 不能为空');
      const cap = ctx.capabilities;
      if (!cap || typeof cap.taskResult !== 'function') throw new Error('桥接未提供任务会话能力（capabilities.taskResult）');
      return cap.taskResult({ token, taskId });
    }
  });

  return {
    hooks: {
      // 只给主人会话注入用法提示；其它会话（群/陌生人）既没有令牌也没有能力，不提示也不可用。
      beforePrompt(payload) {
        if (String(payload?.key ?? '') !== ownerKey) return '';
        return '【L 层任务委派】你有三个任务会话工具：qq_task_spawn(token, title, task) 在 DSH 里开一个独立任务会话（主人在界面上可见、可回答它的提问）；qq_task_list(token) 看任务列表；qq_task_result(token, taskId) 取某个任务的结果。遇到需要长时间、多步骤、要独立完成（比如查资料整理、写脚本、批量处理文件）的活，可以考虑丢给任务会话，而不是在聊天里吭哧吭哧干；任务会话结束会唤醒你，那时取结果、用 1~3 条自然地向主人汇报。';
      }
    }
  };
}
