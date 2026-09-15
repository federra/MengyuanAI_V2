import assert from 'node:assert/strict';
import {readLoginState} from '../browser-extension/login-state.js';
globalThis.location={origin:'https://www.doubao.com'};globalThis.innerWidth=1600;globalThis.innerHeight=1000;
class Element {
  constructor(text,avatar=false){this.innerText=text;this.avatar=avatar;this.tagName='DIV';this.rect={left:20,right:180,top:940,height:40};}
  getClientRects(){return this.hidden?[]:[1];}closest(){return null;}contains(e){return e.parentElement===this;}
  getBoundingClientRect(){return this.rect;}querySelector(){return this.avatar?{}:null;}
}
globalThis.HTMLElement=Element;
globalThis.getComputedStyle=e=>({visibility:e.invisible?'hidden':'visible',display:'block'});
let controls=[],editors=[],running=[],avatars=[],challenges=[],dialogs=[];
globalThis.document={querySelectorAll(selector){if(selector==='img')return avatars;if(selector.startsWith('[id*="captcha"'))return challenges;if(selector.startsWith('[role="dialog"'))return dialogs;if(selector==='button,[role="button"],a')return controls;if(selector==='textarea,[contenteditable="true"]')return editors;if(selector.startsWith('[aria-busy'))return running;return [];}};
assert.equal(readLoginState().state,'unknown','a loaded page alone is not a logged-in account');
controls=[new Element('登录')];assert.equal(readLoginState().state,'loggedOut');
controls=[new Element('珍秘',true)];let r=readLoginState();assert.equal(r.state,'loggedIn');assert.equal(r.nickname,'珍秘');assert.equal(r.safeToClose,true);
editors=[new Element('未提交的草稿')];assert.equal(readLoginState().safeToClose,false);
editors=[];running=[new Element('')];assert.equal(readLoginState().safeToClose,false);
running=[];controls.push(new Element('另一昵称',true));assert.equal(readLoginState().state,'unknown','ambiguous avatars never mark a login');
controls=[];
const row=new Element('珍秘 ›');const avatar=new Element('');avatar.parentElement=row;avatars=[avatar];
assert.equal(readLoginState().nickname,'珍秘','plain div avatar/nickname row from the screenshot is recognized');
const login=new Element('登录');login.hidden=true;controls=[login];assert.equal(readLoginState().state,'loggedIn','hidden login UI is ignored');
login.hidden=false;assert.equal(readLoginState().state,'loggedOut');assert.equal(readLoginState().safeToClose,false);
const slider=new Element('拖动滑块完成拼图');challenges=[slider];assert.equal(readLoginState().state,'verification','verification takes precedence even when nickname/login remain behind overlay');
assert.equal(readLoginState().safeToClose,false);
slider.invisible=true;controls=[];assert.equal(readLoginState().state,'loggedIn','successful login/verification automatically re-reads nickname');
slider.invisible=false;slider.innerText='';slider.tagName='IFRAME';assert.equal(readLoginState().state,'verification','cross-origin challenge iframe is not read or solved');
challenges=[];row.rect={left:500,right:700,top:0,height:30};assert.equal(readLoginState().state,'unknown','top account badge is never read as nickname');
assert.equal(readLoginState().safeToClose,false,'unknown detection never closes the login window');
console.log('PASS DOM login signals, sidebar nickname, ambiguous/missing evidence, draft and running-window close protection.');
