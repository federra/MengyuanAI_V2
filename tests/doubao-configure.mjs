import assert from 'node:assert/strict';
import {configureVideo} from '../browser-extension/configure-video.js';
// Semantic DOM fixture: dropdowns are initially closed, as in the supplied UI.
const realTimeout=globalThis.setTimeout;
globalThis.setTimeout=fn=>{fn();return 0;};
globalThis.location={origin:'https://doubao.com',pathname:'/chat/create-image'};
globalThis.Event=class {constructor(type,options){this.type=type;Object.assign(this,options);}};
globalThis.KeyboardEvent=globalThis.Event;globalThis.MouseEvent=globalThis.Event;globalThis.PointerEvent=globalThis.Event;globalThis.window=globalThis;
let model='Seedance 2.0 Mini',ratio='自动',duration=10,open='',refuseDuration=false;
const actions=[];
class Element {
  constructor(label,click=()=>{}){this.label=label;this.click=click;}
  get innerText(){return typeof this.label==='function'?this.label():this.label;}
  get textContent(){return this.innerText;}
  getClientRects(){return [1];}
  getBoundingClientRect(){return {x:0,y:0,width:100,height:30};}
  dispatchEvent(){}
  closest(){return null;}
  contains(e){return this.children?.includes(e)||false;}
  getAttribute(k){return this.attrs?.[k]??null;}
  focus(){}
  querySelectorAll(selector){return this.children||[];}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
class Input extends Element {
  constructor(){super('');this.min='4';this.max='15';this.step='1';}
  get value(){return String(duration);}
  set value(value){if(!refuseDuration)duration=Number(value);}
  dispatchEvent(){}
}
globalThis.HTMLElement=Element;globalThis.HTMLInputElement=Input;
const slider=new Input();
const editor=new Element('');editor.attrs={placeholder:'描述你想要的视频'};
const mode=new Element('视频',()=>actions.push('视频'));
const modelTrigger=new Element(()=>`模型 ${model}`,()=>{open='model';actions.push('模型菜单');});
const modelOption=new Element('Seedance 2.0 Fast',()=>{model='Seedance 2.0 Fast';open='';actions.push('选择模型');});
const parameterTrigger=new Element(()=>`${ratio} · ${duration}s`,()=>{open=open==='parameters'?'':'parameters';actions.push('参数菜单');});
const ratioOption=new Element('16:9',()=>{ratio='16:9';actions.push('比例');});
const menu=new Element('比例 自动 16:9 时长');menu.children=[ratioOption,slider];
menu.querySelectorAll=selector=>selector.includes('[role="slider"]')?[slider]:menu.children;
const composer=new Element(()=>`视频 模型 ${model} ${ratio} ${duration}s`);composer.children=[mode,modelTrigger,parameterTrigger];editor.parentElement=composer;
globalThis.document={body:new Element(''),querySelectorAll(selector){
  if(selector==='textarea')return [editor];
  if(selector==='[role="slider"],input[type="range"]')return open==='parameters'?[slider]:[];
  if(selector==='[role="dialog"],[role="menu"],[role="listbox"],div')return open==='parameters'?[menu]:[];
  return [...composer.children,...(open==='model'?[modelOption]:[]),...(open==='parameters'?[menu,ratioOption,slider]:[])];
}};
const job={status:'prepared',task:{model:'Seedance 2.0 Fast',ratio:'16:9',duration:12}};
try {
  let result=await configureVideo(job,{promptSelector:'textarea'});
  assert.equal(result.ok,true,result.error);assert.equal(duration,12);assert.equal(ratio,'16:9');assert.equal(model,'Seedance 2.0 Fast');
  assert.deepEqual(actions,['视频','模型菜单','选择模型','参数菜单','比例','参数菜单']);
  assert.equal(result.steps.length,3);
  result=await configureVideo({...job,task:{...job.task,duration:30}},{promptSelector:'textarea'});
  assert.equal(result.ok,false);assert.match(result.error,/范围|时长/);assert.equal(duration,12,'unsupported duration is not clamped');
  open='';editor.attrs={};
  result=await configureVideo({...job,task:{...job.task,duration:10}},{promptSelector:'textarea'});
  assert.equal(result.ok,true,'video model plus duration confirms a rich editor without placeholder/ARIA');
  model='Seedream 4.5';open='';
  result=await configureVideo(job,{promptSelector:'textarea'});
  assert.equal(result.ok,false);assert.match(result.error,/未确认.*视频模式/);
  model='Seedance 2.0 Fast';
  open='';refuseDuration=true;
  result=await configureVideo({...job,task:{...job.task,duration:8}},{promptSelector:'textarea'});
  assert.equal(result.ok,false);assert.match(result.error,/没有接受/);
  location.origin='https://unrelated.example';
  result=await configureVideo(job,{});assert.equal(result.ok,false);assert.match(result.error,/不是豆包/);
  console.log('PASS ordered video/model/menu/ratio/slider flow, exact readback, unsupported-duration rejection, failed slider update and host boundary.');
} finally {globalThis.setTimeout=realTimeout;}
