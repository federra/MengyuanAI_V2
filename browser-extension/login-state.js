// Reads visible account UI only; never reads cookies, passwords or chat contents.
export function readLoginState(settings = {}) {
  const visible = e => e instanceof HTMLElement && e.getClientRects().length && !e.closest('[aria-hidden="true"],[hidden]') && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
  const text = e => (e.innerText || e.textContent || '').trim();
  try {
    if (!['https://www.doubao.com', 'https://doubao.com'].includes(location.origin)) return {state:'unknown', message:'不是豆包页面', safeToClose:false};
    const controls = [...document.querySelectorAll('button,[role="button"],a')].filter(visible);
    const dialogs = [...document.querySelectorAll('[role="dialog"],dialog,[aria-modal="true"]')].filter(visible);
    // Verification takes precedence over a nickname still visible behind the overlay.
    const challenges = [...document.querySelectorAll('[id*="captcha"],[class*="captcha"],[id*="verify"],[class*="verify"],iframe[src*="captcha"],iframe[src*="verify"],iframe[title*="验证"]')].filter(visible);
    const verificationText = /拖动滑块|滑动滑块|滑块验证|完成拼图|安全验证|请完成验证|请通过验证|请依次点击/;
    if (challenges.some(e => e.tagName === 'IFRAME' || verificationText.test(text(e))) || dialogs.some(e => verificationText.test(text(e)))) {
      return {state:'verification', nickname:'', message:'请在豆包窗口手动完成滑块或安全验证，完成后自动重新读取昵称', safeToClose:false};
    }
    const login = controls.some(e => /^(登录|登录\s*\/\s*注册|登录豆包|立即登录|扫码登录|手机号登录|验证码登录)$/.test(text(e))) || dialogs.some(e => /扫码登录|手机号登录|登录豆包/.test(text(e)));
    const editors = [...document.querySelectorAll('textarea,[contenteditable="true"]')].filter(visible);
    const draft = editors.some(e => (e.value || e.innerText || '').trim());
    const running = [...document.querySelectorAll('[aria-busy="true"]'+(settings.runningSelector ? ','+settings.runningSelector : ''))].some(visible) || controls.some(e => /^(停止生成|取消生成|生成中|排队中)/.test(text(e)));
    const safeToClose = !draft && !running;
    if (login) return {state:'loggedOut', nickname:'', message:'请在豆包窗口完成登录，跳转后将自动重新读取昵称', safeToClose:false};
    let candidates;
    if (settings.nicknameSelector) candidates = [...document.querySelectorAll(settings.nicknameSelector)].filter(visible);
    else {
      const accountArea = e => {
        if (!visible(e) || e.closest('#director-account-identity')) return false;
        const rect = e.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth * .3 && rect.top > innerHeight * .7 && rect.height <= 120 && text(e).length > 0 && text(e).length <= 80;
      };
      // The sidebar account is often a plain div, not a button. Walk only avatar
      // ancestors in the bottom-left account area, never the page title/chat body.
      const avatarContainers = [];
      for (const avatar of document.querySelectorAll('img')) {
        if (!visible(avatar)) continue;
        const rect = avatar.getBoundingClientRect();
        if (rect.left < 0 || rect.right > innerWidth * .3 || rect.top <= innerHeight * .7) continue;
        let parent = avatar.parentElement;
        for (let depth = 0; parent && depth < 6; depth++, parent = parent.parentElement) {
          if (accountArea(parent)) { avatarContainers.push(parent); break; }
        }
      }
      candidates = [...new Set([...avatarContainers, ...controls.filter(e => accountArea(e) && !!e.querySelector('img'))])];
    }
    candidates = candidates.filter(e => !candidates.some(other => other !== e && e.contains(other)));
    if (candidates.length !== 1) return {state:'unknown', message:'等待左下角账号昵称加载；请保持侧栏展开，页面加载后自动重读', safeToClose:false};
    const nickname = text(candidates[0]).replace(/[›〉⌄]+$/g,'').trim();
    if (!nickname || /[\r\n]/.test(nickname) || /^(登录|豆包|AI 创作|个人中心|设置)$/.test(nickname)) return {state:'unknown', message:'账号信息未加载完成，等待自动重新读取', safeToClose:false};
    return {state:'loggedIn', nickname, message:`已检测登录：${nickname}`, safeToClose};
  } catch { return {state:'unknown', message:'登录检测控件无法读取，请检查页面适配设置', safeToClose:false}; }
}

export function labelAccount(identity) {
  const serial = String(identity.serial || '').padStart(3, '0');
  const label = `豆包${serial} · ${identity.nickname || identity.accountName || '待检测昵称'}`;
  globalThis.__directorAccountLabel = label;
  const update = () => {
    const title = document.title.replace(/^【豆包[^】]*】\s*/, '').trim();
    // document.title trims whitespace. A trailing space on an initially empty
    // title would otherwise make this observer write forever and freeze the tab.
    const next = `【${globalThis.__directorAccountLabel}】 ${title}`.trim();
    if (document.title !== next) document.title = next;
  };
  update();
  if (!globalThis.__directorTitleObserver && document.querySelector('title')) {
    globalThis.__directorTitleObserver = new MutationObserver(update);
    globalThis.__directorTitleObserver.observe(document.querySelector('title'), {childList:true,subtree:true,characterData:true});
  }
  let badge = document.getElementById('director-account-identity');
  if (!badge) {
    badge = document.createElement('div'); badge.id = 'director-account-identity';
    badge.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:5px 12px;border-radius:8px;background:#16305a;color:white;font:13px system-ui;pointer-events:none;max-width:420px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    document.body.append(badge);
  }
  badge.textContent = label;
}
