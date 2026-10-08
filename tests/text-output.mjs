// Run models.mjs first; real request preparation with an inert provider.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {configs,defaults} from '../work/model-test/fake.mjs';
import {seal,textRequest} from '../work/model-test/model-server.mjs';
import {modelDefaults} from '../work/model-test/models.mjs';
const secret = await seal('test-only-key');
const originalFetch = globalThis.fetch;
const request = {messages:[{role:'user',content:'提取资产'}],max_tokens:8000,stream:false};
function setup(model='deepseek-flash',thinking='auto',result={choices:[{finish_reason:'stop',message:{content:'{"assets":[]}'}}]}) {
  defaults.clear();
  configs.set('text',{body:JSON.stringify({...modelDefaults[0],model,thinking,enabled:true,baseUrl:'https://api.example.com/v1'}),secret});
  const calls=[];
  globalThis.fetch=async (_url,options)=>{calls.push(JSON.parse(options.body));return Response.json(result);};
  return calls;
}
void test('DeepSeek automatic thinking omits caller caps by default',async()=>{
  const calls=setup();
  await textRequest(request);
  assert.equal(calls[0].max_tokens,undefined);
  assert.equal(calls[0].thinking,undefined,'preserve automatic thinking preference');
});
void test('non-thinking and unknown providers also omit caller budgets by default',async()=>{
  for(const [model,thinking] of [['deepseek-flash','disabled'],['other-model','auto']]){
    const calls=setup(model,thinking);await textRequest(request);assert.equal(calls[0].max_tokens,undefined);
  }
  const calls=setup('deepseek-v4-pro','enabled');
  await textRequest({...request,max_tokens:100000});
  assert.equal(calls[0].max_tokens,undefined);
});
void test('reasoning-only truncation survives for the storyboard caller without becoming正文',async()=>{
  const calls=setup('deepseek-flash','auto',{choices:[{finish_reason:'length',message:{content:null,reasoning_content:'private reasoning'}}]});
  const response=await textRequest(request,{allowEmptyTruncated:true});
  const data=await response.json();
  assert.equal(data.choices[0].finish_reason,'length');
  assert.equal(data.choices[0].message.content,'');
  assert.equal(calls.length,1,'do not retry a billable request in the transport');
});
void test('asset callers get an output-budget error for empty truncation, not advice to shorten input',async()=>{
  setup('deepseek-flash','auto',{choices:[{finish_reason:'length',message:{content:'',reasoning_content:'private reasoning'}}]});
  await assert.rejects(textRequest(request),error=>{
    assert.match(error.message,/由服务商决定/);
    assert(!error.message.includes('private reasoning'));
    assert(!error.message.includes('缩短输入'));
    return true;
  });
});
void test('a genuinely empty completed response is not treated as a usable result',async()=>{
  setup('other-model','auto',{choices:[{finish_reason:'stop',message:{content:''}}]});
  await assert.rejects(textRequest(request),/未返回正文/);
});
test.after(()=>{globalThis.fetch=originalFetch;});
