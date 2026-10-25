// 浏览器管理插件（E 层）：像人一样浏览的管理口径。
//
// 实际浏览器动作仍走既有 Playwright MCP（真实 Edge CDP + puppeteer-core），
// 这个插件负责「怎么用得安全、拟人、免重复登录」：
//   · 复用本机登录态，不自动填账号密码；
//   · 读结构优先、一次一页、慢一点，不批量爬；
//   · 禁支付/银行/身份验证，敏感页不截图；
//   · 遇到登录/验证码，让用户自己在窗口完成；
//   · 节奏拟人，防风控。
// 后续可加「无头模式」：同一套规则，后端换成 headless 浏览器（保留独立 profile 以复用登录态）。

export function createPlugin(ctx) {
  const rules = Array.isArray((ctx.config || {}).rules) && ctx.config.rules.length
    ? ctx.config.rules.map(String).filter(Boolean).slice(0, 12)
    : ['复用本机登录态，不自动填账号密码', '禁支付/银行/身份验证', '节奏拟人防风控'];

  ctx.registerTool('browser_policy', {
    description: '查询浏览器使用的安全与拟人规则（只读）',
    handler: () => ({ ok: true, mode: 'real-edge', headless: 'planned', rules })
  });

  return {
    hooks: {
      beforePrompt(payload) {
        // 只在需要用到浏览器的会话里给出规则，避免每个回合都塞。
        if (!/(browser|浏览器|抓取|网站|网页|登录态|风控)/.test(String(payload?.incomingText || '') + String(payload?.reason || ''))) return '';
        return [
          '【浏览器使用（像人一样）】',
          ...rules.map((r) => '- ' + r),
          '规则优先：拿不准时宁可慢一点、少一步，也不要触发风控或让用户重新登录。'
        ].join('\n');
      }
    }
  };
}
