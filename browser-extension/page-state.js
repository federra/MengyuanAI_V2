// Runs in the isolated world. Missing/ambiguous markers never mean idle.
export function readPageState(settings) {
  if(settings.automaticPage)return globalThis.__directorInspectComposer?.(settings)||{state:'unknown',error:'正在加载创作页面自动识别'};
  const visible = e => e.getClientRects().length && !e.closest('[aria-hidden="true"]');
  try {
    if (!['https://www.doubao.com','https://doubao.com'].includes(location.origin) || !settings.runningSelector || !settings.idleSelector)
      return { state: 'unknown', error: '请配置并验证“任务运行中标记”和“已空闲标记”，确认前不分配新任务' };
    if ([...document.querySelectorAll(settings.runningSelector)].some(visible) || [...document.querySelectorAll('[aria-busy="true"]')].some(visible)) return { state: 'busy' };
    const idle = [...document.querySelectorAll(settings.idleSelector)].filter(visible);
    if (idle.length !== 1 || idle[0].disabled || idle[0].getAttribute('aria-disabled') === 'true')
      return { state: 'unknown', error: '未确认页面空闲，继续等待原任务' };
    return { state: 'idle' };
  } catch { return { state: 'unknown', error: '页面状态选择器无效，请在豆包插件设置中调整' }; }
}
