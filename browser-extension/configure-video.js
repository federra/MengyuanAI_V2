// Self-contained function, injected into the account's isolated world.
export async function configureVideo(job, settings) {
  const steps = [];
  const visible = e => e instanceof HTMLElement && e.getClientRects().length && !e.closest('[aria-hidden="true"]');
  const text = e => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim();
  const wait = () => new Promise(r => setTimeout(r, 300));
  const elements = (root, selector) => [...root.querySelectorAll(selector)].filter(visible);
  const one = (items, label) => { if (items.length !== 1) throw Error(`无法唯一识别${label}，未提交任务`); return items[0]; };
  const controls = root => elements(root, 'button,[role="button"],[role="tab"],[role="radio"],[role="option"],[role="menuitem"],label,div,span');
  const leaf = items => items.filter(e => !items.some(other => other !== e && e.contains(other)));
  const exact = (root, value) => one(leaf(controls(root).filter(e => text(e) === value)), `“${value}”`);
  const click = async e => {
    const owner = e.closest('button,[role="button"],[role="tab"],[role="radio"],[role="option"],[role="menuitem"]') || e;
    if (e.disabled || owner.disabled || e.getAttribute('aria-disabled') === 'true' || owner.getAttribute('aria-disabled') === 'true') throw Error('所选功能不可用，请核对账号权限');
    // Doubao's Radix tabs use mouse-down; its menus use pointer-down. A lone
    // HTMLElement.click() does not trigger either. Keep the real event order.
    const r=e.getBoundingClientRect(), init={bubbles:true,cancelable:true,composed:true,view:window,button:0,clientX:r.x+r.width/2,clientY:r.y+r.height/2};
    e.dispatchEvent(new PointerEvent('pointerdown',{...init,pointerId:1,pointerType:'mouse',isPrimary:true,buttons:1}));
    e.dispatchEvent(new MouseEvent('mousedown',{...init,buttons:1}));
    e.dispatchEvent(new PointerEvent('pointerup',{...init,pointerId:1,pointerType:'mouse',isPrimary:true,buttons:0}));
    e.dispatchEvent(new MouseEvent('mouseup',{...init,buttons:0}));
    e.click(); await wait();
  };
  const editor = () => {
    if(settings.automaticPage){const probe=globalThis.__directorInspectComposer?.(settings);if(probe?.settings)settings={...settings,...probe.settings};}
    return one(elements(document, settings.promptSelector || 'textarea,[contenteditable="true"]'), '提示词输入框');
  };
  const composer = () => {
    let parent = editor().parentElement;
    while (parent && parent !== document.body) {
      if (text(parent).includes('模型') && text(parent).includes('视频')) return parent;
      parent = parent.parentElement;
    }
    throw Error('没有找到 AI 创作的视频对话框，请打开 AI 创作页面');
  };
  const popup = keyword => one(leaf(elements(document, '[role="dialog"],[role="menu"],[role="listbox"],div').filter(e => text(e).includes(keyword) && (keyword !== '时长' || e.querySelector('[role="slider"],input[type="range"]')))), '参数菜单');
  const modeEvidence = () => {
    const input = editor(), root = composer();
    const hint = [input.getAttribute('placeholder'),input.getAttribute('data-placeholder'),input.getAttribute('aria-placeholder'),input.getAttribute('aria-label'),...elements(input,'[data-placeholder],[data-slate-placeholder]').map(e=>e.getAttribute('data-placeholder')||e.textContent)].join(' ');
    const tab = exact(root,'视频');
    const labels = leaf(controls(root)).map(text);
    const videoModel = labels.some(t => /^(模型\s*)?Seedance\s+\d/i.test(t));
    const imageModel = labels.some(t => /^(模型\s*)?Seedream\s+\d/i.test(t));
    const timedMenu = labels.some(t => /^(自动|\d+:\d+)\s*[·・]?\s*\d+\s*(s|秒)$/.test(t));
    // Rich-text placeholder/ARIA markers differ across versions. The selected
    // video model AND duration control are independent positive mode evidence.
    return {ok:!imageModel&&(/视频/.test(hint)||tab.getAttribute('aria-selected')==='true'||tab.getAttribute('data-state')==='active'||!!tab.closest('[aria-selected="true"]')||(videoModel&&timedMenu)), model:labels.find(t=>/^(模型\s*)?(Seedance|Seedream)/i.test(t))||'未识别',duration:timedMenu};
  };
  try {
    if (!['https://www.doubao.com', 'https://doubao.com'].includes(location.origin)) throw Error('不是豆包页面');
    if (job.status !== 'prepared') return {ok: true, steps};
    if (!location.pathname.startsWith('/chat/create-image')) {
      const draft = editor();
      if ((draft.value || draft.innerText || '').trim()) throw Error('当前对话有草稿，请先保存，再打开 AI 创作');
      await click(exact(document, 'AI 创作'));
    }
    await click(exact(composer(), '视频'));
    let evidence;
    for(let attempt=0;attempt<25;attempt++) {
      try { evidence=modeEvidence(); if(evidence.ok)break; } catch { /* SPA replaces editor during mode switch. */ }
      await wait();
    }
    if(!evidence?.ok)throw Error(`未确认已切换到视频模式（当前模型：${evidence?.model||'未识别'}；时长控件：${evidence?.duration?'已出现':'未出现'}）`);
    steps.push('已进入 AI 创作 → 视频');
    const model = job.task.model || settings.model || 'Seedance 2.0 Mini';
    const modelTrigger = () => one(leaf(controls(composer()).filter(e => /^模型\s*Seedance/.test(text(e)))), '模型菜单');
    if (text(modelTrigger()).replace(/^模型\s*/, '') !== model) {
      await click(modelTrigger());
      await click(exact(document, model));
    }
    if (text(modelTrigger()).replace(/^模型\s*/, '') !== model) throw Error(`模型未切换为 ${model}，可能需要账号升级；未提交`);
    steps.push(`模型已确认：${model}`);
    let overflowId='';
    const triggerCandidates = () => {
      const roots=[composer(),...elements(document,'[role="menu"]').filter(e=>overflowId&&e.getAttribute('aria-labelledby')===overflowId)];
      return leaf([...new Set(roots.flatMap(root=>controls(root)))].filter(e=>/^(自动|\d+:\d+)\s*[·・]?\s*\d+\s*(s|秒)$/.test(text(e))));
    };
    const trigger = () => one(triggerCandidates(),'比例和时长菜单');
    const ensureTrigger = async () => {
      if(!triggerCandidates().length){
        const overflowButtons=()=>elements(composer(),'button[data-slot="dropdown-menu-trigger"]').filter(e=>!text(e));
        // The overflow menu is lazy-mounted on first hover. Before that, the
        // toolbar contains a plain ellipsis button with no Radix attributes.
        // Hover only the toolbar's direct placeholder, then re-query the new
        // trigger; clicking the stale placeholder has no effect.
        if(!overflowButtons().length){
          const placeholder=one(elements(composer(),'.bp5-overflow-list > button[aria-hidden="false"]').filter(e=>!text(e)),'折叠参数入口');
          placeholder.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,composed:true,view:window}));
          for(let i=0;i<15&&!overflowButtons().length;i++)await wait();
        }
        const overflow=one(overflowButtons(),'折叠参数入口');
        overflowId=overflow.id;
        await click(overflow);
      }
      return trigger();
    };
    await click(await ensureTrigger());
    let menu = popup('时长');
    const ratio = job.task.ratio || settings.ratio || '16:9';
    await click(exact(menu, ratio));
    // Some versions close this menu when an aspect ratio is selected.
    if (!elements(document, '[role="slider"],input[type="range"]').length) await click(await ensureTrigger());
    menu = popup('时长');
    let slider = one(elements(menu, '[role="slider"],input[type="range"]'), '时长滑块');
    const duration = Number(job.task.duration || settings.duration || 10);
    const native = slider instanceof HTMLInputElement;
    const min = Number(native ? slider.min : slider.getAttribute('aria-valuemin'));
    const max = Number(native ? slider.max : slider.getAttribute('aria-valuemax'));
    const step = Number(native ? slider.step || 1 : slider.getAttribute('data-step') || 1);
    // Doubao exposes slider positions 0..11, while the visible duration is 4..15s.
    // Read the visible range from the slider's containing duration section.
    let rangeRoot=slider.parentElement, secondLabels=[];
    for(let depth=0;!native&&rangeRoot&&depth<6;depth++,rangeRoot=rangeRoot.parentElement){
      const labels=leaf(elements(rangeRoot,'span,div')).map(text).filter(t=>/^\d+\s*(s|秒)$/.test(t)).map(t=>Number(t.match(/\d+/)[0]));
      if(labels.length>=3){secondLabels=labels;break;}
    }
    const secondsMin=secondLabels.length?Math.min(...secondLabels):min, secondsMax=secondLabels.length?Math.max(...secondLabels):max;
    const secondsPerStep=(secondsMax-secondsMin)/(max-min);
    const targetValue=secondLabels.length?min+(duration-secondsMin)/secondsPerStep:duration;
    if (!Number.isFinite(duration) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min || duration < secondsMin || duration > secondsMax || !Number.isFinite(targetValue) || step <= 0 || Math.abs((targetValue - min) / step - Math.round((targetValue - min) / step)) > 0.001) throw Error(`分镜时长 ${duration} 秒不符合当前模型滑块范围，未自动修改时长`);
    slider.focus();
    if (native) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(slider, String(targetValue));
      slider.dispatchEvent(new Event('input', {bubbles: true}));
      slider.dispatchEvent(new Event('change', {bubbles: true}));
    } else {
      for (const key of ['Home', ...Array(Math.round((targetValue - min) / step)).fill('ArrowRight')]) {
        slider=one(elements(popup('时长'),'[role="slider"],input[type="range"]'),'时长滑块');
        slider.focus();
        slider.dispatchEvent(new KeyboardEvent('keydown', {key, code: key, bubbles: true}));
        slider.dispatchEvent(new KeyboardEvent('keyup', {key, code: key, bubbles: true}));
        await wait();
      }
    }
    await wait();
    slider=one(elements(popup('时长'),'[role="slider"],input[type="range"]'),'时长滑块');
    if (Number(native ? slider.value : slider.getAttribute('aria-valuenow')) !== targetValue) throw Error('时长滑块没有接受目标值，请手动核对；未提交');
    await click(await ensureTrigger());
    const summary = text(await ensureTrigger()).replace(/\s|[·・]/g, '');
    if (summary !== `${ratio}${duration}s` && summary !== `${ratio}${duration}秒`) throw Error('比例或时长读回不一致，未提交');
    if(overflowId){const overflow=document.getElementById(overflowId);if(overflow?.getAttribute('aria-expanded')==='true')await click(overflow);}
    steps.push(`参数已确认：${ratio} · ${duration}秒`);
    const resolution = job.task.resolution || settings.resolution;
    if (resolution) throw Error('当前截图中的豆包菜单未提供清晰度选项，请清空插件默认清晰度或手动核对；未提交');
    return {ok: true, steps, effective: {model, ratio, duration}};
  } catch (e) { return {ok: false, error: e.message, steps}; }
}
