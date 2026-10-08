import assert from 'node:assert/strict';
import {probeResult} from '../browser-extension/probe-result.js';
const url='https://www.doubao.com/chat/123';globalThis.location={origin:'https://www.doubao.com',pathname:'/chat/123',href:url};
const prompt='原任务提示词足够长可以定位原生成请求';let messages=[],clicks=0;
const play={getClientRects:()=>[1],closest:()=>null,contains:()=>false,click:()=>clicks++};
// DOM-shaped fixture intentionally provides querySelectorAll for the browser probe.
// oxlint-disable-next-line typescript/no-deprecated
const message=(id,text,controls=[])=>({innerText:text,getClientRects:()=>[1],closest:()=>null,getAttribute:()=>id,querySelector:()=>null,querySelectorAll:()=>controls});globalThis.document={querySelectorAll:()=>messages};
const job={requestId:'request',conversationUrl:url,generationAcceptedAt:1,generationMessageId:'waiting',task:{prompt},retrieval:{status:'fetching',key:'attempt'}};
messages=[message('prompt',prompt),message('waiting','正在生成原视频'),message('other-prompt','请生成另一个不同任务'),message('other-result','你的视频生成好了',[play])];
assert.equal(probeResult(job),null,'later result cannot be attributed to earlier original prompt');
messages.splice(2,0,message('original-result','你的视频生成好了',[play]));assert.equal(probeResult(job).messageId,'original-result','match response immediately following saved acknowledgement');
assert.equal(probeResult({...job,resultMessageId:'original-result'}).messageId,'original-result');
messages=[message('prompt',prompt),message('prompt-copy',prompt),message('result','你的视频生成好了',[play])];assert.equal(probeResult({...job,generationMessageId:''}),null,'identical prompts without saved response identity are ambiguous');
assert.equal(clicks,0);delete globalThis.location;delete globalThis.document;
console.log('PASS original retrieval matches original response, rejects newer unrelated and duplicate prompt results.');
