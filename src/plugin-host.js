// 组件宿主（plugin host）
//
// 设计原则（管理员定的）：**万态皆插件** —— 每项能力是一个可独立插拔、独立优化的组件；
// 组件用一份 skill.md 描述自己，按时间或按需被调用，也能反过来调用 AI。
//
// 目录约定：plugins/qq-components/<id>/ 下放
//   plugin.json  { id, name, version, description, category, order, tags, hooks, schedule, config, enabled }
//   index.js     export function createPlugin(ctx) → { hooks: { onIncoming, beforePrompt, afterSend, onTick } }
//   skill.md     人读的说明书（插件管理页会直接展示）
//
// 约定：
//   · 插件崩溃/超时不影响桥接（全部 try/catch，加载失败只告警）；
//   · 插件拿不到裸 fs/网络，只能用受限 API（state / prompt 段落 / askAI / 工具注册）；
//   · 插件自己的持久状态在 state/plugins/<id>.json，启停/排序在 state/plugins/registry.json。

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ETCLOVG 七层：管理页按层展示，哪怕某层还没有插件也要显示出来（缺口可见）。
const HARNESS_LAYERS = [
  { id: 'C', name: '上下文与记忆', desc: '提示词装配、快照、记忆、画像' },
  { id: 'T', name: '工具接口与协议', desc: 'MCP 工具、插件工具、调用约定' },
  { id: 'E', name: '执行环境与沙箱', desc: '沙箱、浏览器、本机执行、审批' },
  { id: 'L', name: '生命周期与编排', desc: '唤醒、回合、定时、恢复、多 agent' },
  { id: 'O', name: '可观测性与运维', desc: '日志、trace、成本、自愈' },
  { id: 'V', name: '验证与评估', desc: '基准、评分、回归' },
  { id: 'G', name: '治理与安全', desc: '权限、策略、审计、内容闸门' },
  { id: 'S', name: '近人意识（SCHNIE）', desc: '预留：哲学思考资料与逻辑方式驱动的「近人」核心' }
];

const HOOK_NAMES = ['onIncoming', 'beforePrompt', 'afterSend', 'onTick'];
const MAX_PROMPT_BLOCK_CHARS = 1200;

function safeId(id) {
  return /^[a-z0-9][a-z0-9._-]{0,40}$/i.test(String(id || ''));
}

function readJsonSafe(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonSafe(file, value) {
  try {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 1), 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   root: string,
 *   logger?: (msg: string) => void,
 *   askAI?: (prompt: string, opts?: object) => boolean,
 * }} opts
 */
export function createPluginHost(opts = {}) {
  const root = String(opts.root || '');
  const log = typeof opts.logger === 'function' ? opts.logger : () => {};
  const askAI = typeof opts.askAI === 'function' ? opts.askAI : () => false;
  // 桥接注入的受控能力（同一对象引用，晚绑定：桥接在 main() 里再往上面挂函数）。
  // 插件只能通过这里碰桥接内部（例如启动任务会话），拿不到裸 fs/网络之外的其它内部状态。
  const capabilities = opts.capabilities && typeof opts.capabilities === 'object' ? opts.capabilities : {};
  const plugins = new Map();
  const tools = new Map();
  let warnings = [];
  let loaded = false;

  const baseDir = () => path.join(root, 'plugins', 'qq-components');
  const registryFile = () => path.join(root, 'state', 'plugins', 'registry.json');
  const registry = () => {
    const raw = readJsonSafe(registryFile(), {});
    return {
      disabled: Array.isArray(raw.disabled) ? raw.disabled.map(String) : [],
      order: Array.isArray(raw.order) ? raw.order.map(String) : []
    };
  };
  const saveRegistry = (next) => writeJsonSafe(registryFile(), next);

  function makeState(id) {
    const file = path.join(root, 'state', 'plugins', id + '.json');
    let cache = null;
    const load = () => {
      if (cache) return cache;
      const raw = readJsonSafe(file, {});
      cache = raw && typeof raw === 'object' ? raw : {};
      return cache;
    };
    return {
      get() { return load(); },
      set(patch) {
        const next = { ...load(), ...(patch && typeof patch === 'object' ? patch : {}) };
        cache = next;
        writeJsonSafe(file, next);
        return next;
      }
    };
  }

  async function loadOne(dir, disabledIds, builtin = true) {
    const manifestPath = path.join(dir, 'plugin.json');
    if (!fs.existsSync(manifestPath)) return;
    const manifest = readJsonSafe(manifestPath, null);
    if (!manifest || typeof manifest !== 'object') { warnings.push('plugin.json 解析失败：' + dir); return; }
    const id = String(manifest.id || path.basename(dir));
    if (!safeId(id)) { warnings.push('插件 id 不合法：' + id); return; }
    if (manifest.enabled === false || disabledIds.includes(id)) {
      plugins.set(id, { id, manifest, ctx: null, hooks: {}, skillPath: null, disabled: true, timer: null, tools: [], builtin });
      return;
    }
    const entry = path.join(dir, String(manifest.main || 'index.js'));
    if (!fs.existsSync(entry)) { warnings.push('插件入口缺失：' + id); return; }
    const skillPath = fs.existsSync(path.join(dir, 'skill.md')) ? path.join(dir, 'skill.md') : null;
    try {
      const mod = await import(pathToFileURL(entry).href + '?t=' + Date.now());
      const factory = mod.createPlugin || mod.default;
      if (typeof factory !== 'function') { warnings.push('插件未导出 createPlugin：' + id); return; }
      const pluginTools = [];
      const ctx = {
        id,
        dir,
        root,
        manifest,
        config: manifest.config || {},
        capabilities,
        state: makeState(id),
        log: (m) => log('[plugin:' + id + '] ' + m),
        warn: (m) => { warnings.push(id + ': ' + m); log('[plugin:' + id + '] WARN ' + m); },
        promptBlocks: [],
        addPromptBlock(text) {
          const t = String(text || '').trim();
          if (t) ctx.promptBlocks.push(t.slice(0, MAX_PROMPT_BLOCK_CHARS));
        },
        askAI(prompt, askOpts = {}) {
          try { return askAI(String(prompt || ''), { plugin: id, ...askOpts }); } catch { return false; }
        },
        registerTool(name, spec) {
          const toolName = String(name || '').trim();
          if (!safeId(toolName)) { ctx.warn('工具名不合法：' + toolName); return; }
          if (!spec || typeof spec.handler !== 'function') { ctx.warn('工具缺少 handler：' + toolName); return; }
          tools.set(toolName, { plugin: id, description: String(spec.description || ''), schema: spec.schema || null, handler: spec.handler });
          pluginTools.push(toolName);
        }
      };
      const inst = await factory(ctx) || {};
      const hooks = inst.hooks && typeof inst.hooks === 'object' ? inst.hooks : {};
      for (const h of Object.keys(hooks)) if (!HOOK_NAMES.includes(h)) warnings.push(id + '：未知钩子 ' + h);
      plugins.set(id, {
        id,
        manifest,
        ctx,
        hooks,
        skillPath,
        disabled: false,
        tools: pluginTools,
        schedule: inst.schedule || manifest.schedule || null,
        timer: null,
        builtin
      });
      log('[plugin] 已加载 ' + id + (manifest.description ? ' — ' + manifest.description : ''));
    } catch (error) {
      warnings.push('插件加载失败 ' + id + ': ' + (error?.message ?? error));
    }
  }

  async function loadAll() {
    // 清掉上一次的定时器与注册表（热重载复用同一实例）
    for (const p of plugins.values()) {
      if (p.timer) { try { clearInterval(p.timer); } catch {} }
    }
    plugins.clear();
    tools.clear();
    warnings = [];
    const disabledIds = registry().disabled;
    if (fs.existsSync(baseDir())) {
      for (const name of fs.readdirSync(baseDir())) {
        const dir = path.join(baseDir(), name);
        try { if (fs.statSync(dir).isDirectory()) await loadOne(dir, disabledIds); } catch {}
      }
    }
    // 定时钩子由宿主统一触发，插件不持有裸 setInterval
    for (const p of plugins.values()) {
      const everyMs = Number(p.schedule?.everyMs);
      if (!p.disabled && Number.isFinite(everyMs) && everyMs >= 60000 && typeof p.hooks.onTick === 'function') {
        p.timer = setInterval(() => {
          try { p.hooks.onTick({ now: Date.now() }); } catch (error) { warnings.push('onTick 失败 ' + p.id + ': ' + (error?.message ?? error)); }
        }, everyMs);
        if (typeof p.timer.unref === 'function') p.timer.unref();
      }
    }
    loaded = true;
    return api.summary();
  }

  function orderedPlugins() {
    const reg = registry();
    const orderIndex = new Map(reg.order.map((id, i) => [id, i]));
    return [...plugins.values()].sort((a, b) => {
      const ai = orderIndex.has(a.id) ? orderIndex.get(a.id) : 1000 + (Number(a.manifest?.order) || 0);
      const bi = orderIndex.has(b.id) ? orderIndex.get(b.id) : 1000 + (Number(b.manifest?.order) || 0);
      if (ai !== bi) return ai - bi;
      return a.id.localeCompare(b.id);
    });
  }

  const api = {
    layers() {
      const byLayer = new Map(HARNESS_LAYERS.map((l) => [l.id, []]));
      for (const p of plugins.values()) {
        const id = String(p.manifest?.layer || '');
        if (!byLayer.has(id)) byLayer.set(id, []);
        byLayer.get(id).push({ id: p.id, name: p.manifest?.name || p.id, enabled: !p.disabled });
      }
      return HARNESS_LAYERS.map((l) => ({ ...l, plugins: byLayer.get(l.id) || [] }));
    },
    loadAll,
    async reload() { return loadAll(); },
    summary() {
      const reg = registry();
      return {
        count: [...plugins.values()].filter((p) => !p.disabled).length,
        total: plugins.size,
        warnings: warnings.slice(-20),
        layers: api.layers(),
        plugins: orderedPlugins().map((p) => ({
          id: p.id,
          name: p.manifest?.name || p.id,
          version: p.manifest?.version || '',
          description: p.manifest?.description || '',
          category: p.manifest?.category || '未分类',
          layer: p.manifest?.layer || '',
          builtin: p.builtin !== false,
          tags: Array.isArray(p.manifest?.tags) ? p.manifest.tags : [],
          enabled: !p.disabled,
          hooks: Object.keys(p.hooks || {}),
          schedule: p.schedule || null,
          hasSkill: !!p.skillPath,
          tools: (p.tools || []).map((name) => ({ name, description: tools.get(name)?.description || '' })),
          stateFile: 'state/plugins/' + p.id + '.json'
        }))
      };
    },
    list() { return api.summary(); },
    get(id) {
      const p = plugins.get(String(id || ''));
      if (!p) return null;
      return {
        id: p.id,
        name: p.manifest?.name || p.id,
        version: p.manifest?.version || '',
        description: p.manifest?.description || '',
        category: p.manifest?.category || '未分类',
        layer: p.manifest?.layer || '',
        builtin: p.builtin !== false,
        tags: Array.isArray(p.manifest?.tags) ? p.manifest.tags : [],
        enabled: !p.disabled,
        hooks: Object.keys(p.hooks || {}),
        schedule: p.schedule || null,
        main: p.manifest?.main || 'index.js',
        config: p.manifest?.config || {},
        skill: api.getSkill(p.id),
        state: p.ctx ? p.ctx.state.get() : {},
        tools: (p.tools || []).map((name) => ({ name, description: tools.get(name)?.description || '' }))
      };
    },
    getSkill(id) {
      const p = plugins.get(String(id || ''));
      if (!p || !p.skillPath) return '';
      try { return fs.readFileSync(p.skillPath, 'utf8'); } catch { return ''; }
    },
    setEnabled(id, enabled) {
      const pid = String(id || '');
      if (!plugins.has(pid) && !safeId(pid)) return { ok: false, error: '没有这个插件：' + pid };
      const reg = registry();
      const set = new Set(reg.disabled);
      if (enabled) set.delete(pid); else set.add(pid);
      saveRegistry({ ...reg, disabled: [...set] });
      return { ok: true, id: pid, enabled: !!enabled };
    },
    setOrder(order) {
      const ids = (Array.isArray(order) ? order : []).map(String).filter(safeId);
      const reg = registry();
      saveRegistry({ ...reg, order: ids });
      return { ok: true, order: ids };
    },
    emitIncoming(payload) {
      for (const p of plugins.values()) {
        if (p.disabled || typeof p.hooks.onIncoming !== 'function') continue;
        try { p.hooks.onIncoming({ ...(payload || {}), pluginState: p.ctx.state }); } catch (error) { warnings.push('onIncoming 失败 ' + p.id + ': ' + (error?.message ?? error)); }
      }
    },
    collectPromptBlocks(payload) {
      const blocks = [];
      for (const p of plugins.values()) {
        if (p.disabled || typeof p.hooks.beforePrompt !== 'function') continue;
        try {
          const out = p.hooks.beforePrompt({ ...(payload || {}), promptBlocks: p.ctx.promptBlocks });
          if (typeof out === 'string' && out.trim()) blocks.push(out.trim().slice(0, MAX_PROMPT_BLOCK_CHARS));
        } catch (error) {
          warnings.push('beforePrompt 失败 ' + p.id + ': ' + (error?.message ?? error));
        }
      }
      for (const p of plugins.values()) {
        if (p.disabled) continue;
        for (const b of p.ctx.promptBlocks) blocks.push(String(b).slice(0, MAX_PROMPT_BLOCK_CHARS));
        p.ctx.promptBlocks.length = 0;
      }
      return blocks;
    },
    emitSent(payload) {
      for (const p of plugins.values()) {
        if (p.disabled || typeof p.hooks.afterSend !== 'function') continue;
        try { p.hooks.afterSend({ ...(payload || {}), pluginState: p.ctx.state }); } catch (error) { warnings.push('afterSend 失败 ' + p.id + ': ' + (error?.message ?? error)); }
      }
    },
    async callTool(name, input) {
      const tool = tools.get(String(name || ''));
      if (!tool) return { ok: false, error: '没有这个插件工具：' + name };
      try {
        const result = await tool.handler(input || {});
        return { ok: true, plugin: tool.plugin, result };
      } catch (error) {
        return { ok: false, error: error?.message ?? String(error) };
      }
    },
    listTools() {
      return [...tools.entries()].map(([name, t]) => ({ name, plugin: t.plugin, description: t.description }));
    },
    isLoaded() { return loaded; }
  };

  return api;
}
