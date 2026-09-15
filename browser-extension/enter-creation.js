// Navigation precedes dispatch: the ordinary chat page has no video controls.
// Preserve an existing draft, and never navigate a submitted task away.
export function enterCreation() {
  const visible=e=>e instanceof HTMLElement&&e.getClientRects().length&&!e.closest('[hidden],[aria-hidden="true"]')&&getComputedStyle(e).visibility!=='hidden';
  const text=e=>(e.innerText||e.textContent||'').replace(/\s+/g,' ').trim();
  if(!['https://www.doubao.com','https://doubao.com'].includes(location.origin))return {ok:false,error:'等待豆包页面'};
  if(location.pathname.startsWith('/chat/create-image'))return {ok:true,navigated:false};
  if([...document.querySelectorAll('[role="dialog"],[aria-modal="true"],[class*="captcha"],iframe[src*="captcha"]')].filter(visible).some(e=>e.tagName==='IFRAME'||/登录|验证|滑块/.test(text(e))))return {ok:false,error:'请先完成豆包登录或验证，完成后自动进入 AI 创作'};
  const editors=[...document.querySelectorAll('textarea,[contenteditable="true"]')].filter(visible);
  if(editors.some(e=>(e.value||e.innerText||'').trim()))return {ok:false,error:'当前对话有未发送草稿，请保存或清空后继续'};
  const nodes=[...document.querySelectorAll('button,[role="button"],[role="status"],a,span,div')].filter(visible);
  if(nodes.some(e=>!editors.some(editor=>e.contains(editor))&&/^(停止生成|取消生成|正在生成|生成中|视频生成中|排队中|正在排队)([.…\s\d%]|$)/.test(text(e))&&text(e).length<60))return {ok:false,error:'当前豆包页面仍在运行，完成后再进入 AI 创作'};
  const matches=nodes.filter(e=>text(e)==='AI 创作');
  const leaves=matches.filter(e=>!matches.some(other=>other!==e&&e.contains(other)));
  // The creation entry may be collapsed or absent in normal chat layouts.
  // After login/draft/activity checks, open the canonical page in another tab.
  if(leaves.length!==1)return {ok:false,openCreation:true,error:'正在打开豆包 AI 创作页面'};
  const target=leaves[0].closest('button,a,[role="button"]')||leaves[0];
  if(target.disabled||target.getAttribute('aria-disabled')==='true')return {ok:false,error:'AI 创作入口暂不可用'};
  target.click();return {ok:true,navigated:true};
}
