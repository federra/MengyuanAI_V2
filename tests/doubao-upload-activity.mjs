import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const messages=[],pending=[];
const win={addEventListener(){},postMessage:m=>messages.push(m),fetch:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))};
class XHR { constructor(){this.listeners={};} open(){} send(){if(this.fail)throw Error('upload blocked');} addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);} finish(){for(const fn of this.listeners.loadend||[])fn();} }
const ctx=vm.createContext({window:win,location:{origin:'https://www.doubao.com',href:'https://www.doubao.com/chat/create-image'},URL,Request,Blob,FormData,ArrayBuffer,XMLHttpRequest:XHR,TextDecoder,DirectorMedia:{extract:()=>({media:[],identities:[]})}});
vm.runInContext(await fs.readFile('browser-extension/observer.js','utf8'),ctx);
const active=()=>messages.filter(m=>m.type==='uploadActivity').at(-1)?.active;
const one=win.fetch('/upload',{method:'POST',body:new Blob(['one'])});
const two=win.fetch('/upload',{method:'POST',body:new Blob(['two'])});
assert.equal(active(),2);
pending.shift().resolve(new Response('ok'));await one;assert.equal(active(),1,'another reference still uploading');
pending.shift().reject(Error('network'));await assert.rejects(two,/network/);assert.equal(active(),0,'network failure cannot leave a stale busy counter');
const xhr=new XHR();xhr.open('POST','/upload');xhr.send(new FormData());assert.equal(active(),1);xhr.finish();xhr.finish();assert.equal(active(),0,'loadend cannot double-decrement');
const bad=new XHR();bad.fail=true;assert.throws(()=>bad.send(new Blob(['x'])),/blocked/);assert.equal(active(),0);
console.log('PASS concurrent binary uploads, fetch failure and XHR completion/error tracking without stale upload state.');
