// Runs only after the user presses “填入豆包”; never clicks a send/generate button.
export function fillPrompt(prompt){
  if(!['https://www.doubao.com','https://doubao.com'].includes(location.origin))return {ok:false,error:'请在豆包页面操作'};
  const editable=e=>e instanceof HTMLElement && e.getClientRects().length && !e.closest('[aria-hidden="true"]') && ((e instanceof HTMLTextAreaElement && !e.disabled && !e.readOnly)||e.getAttribute('contenteditable')==='true');
  const candidates=[...document.querySelectorAll('textarea,[contenteditable="true"]')].filter(editable);
  const focused=editable(document.activeElement)?document.activeElement:null;
  const editor=focused || (candidates.length===1?candidates[0]:null);
  if(!editor)return {ok:false,error:'请先登录豆包，进入视频创作并点击提示词输入框；暂时无法唯一识别输入框，可使用“复制提示词”手动粘贴。'};
  const current=editor instanceof HTMLTextAreaElement?editor.value:editor.innerText;
  if(current.trim()===prompt.trim())return {ok:true};
  if(current.trim())return {ok:false,error:'输入框已有内容，请先核对并清空，插件不会覆盖现有草稿。'};
  editor.focus();
  if(editor instanceof HTMLTextAreaElement){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(editor,prompt);editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:prompt}));}
  else {if(!document.execCommand('insertText',false,prompt))return {ok:false,error:'此输入框不支持自动填入，请复制提示词后手动粘贴。'};}
  const text=editor instanceof HTMLTextAreaElement?editor.value:editor.innerText;
  return text.trim()===prompt.trim()?{ok:true}:{ok:false,error:'输入内容未能完整填入，请使用复制提示词；尚未提交。'};
}
