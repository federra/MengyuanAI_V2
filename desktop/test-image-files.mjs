import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const {exportImage,chooseImage,imageFolder}=createRequire(import.meta.url)('./image-files.cjs');
const picturesDir=await fs.mkdtemp(path.join(os.tmpdir(),'director-image-test-'));
const id='3f2ef4ce-f64e-4965-b773-6c14ab13f6f5';
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
let requests=0;
const config={picturesDir,origin:'http://127.0.0.1:32100',token:'test-only',fetchImage:async(url,init)=>{
  requests++; assert.equal(url,`http://127.0.0.1:32100/api/media/${id}`);
  assert.equal(init.headers.Cookie,'director_session=test-only'); assert.equal(init.redirect,'error');
  return new Response(bytes,{headers:{'content-type':'image/png'}});
}};
const input={projectId:'project-test',mediaId:id,name:'角色/../:CON'};
const filename=await exportImage(input,config);
assert(filename.startsWith(path.join(picturesDir,'AI短片导演','project-test')+path.sep));
assert.equal(path.extname(filename),'.png'); assert.deepEqual(await fs.readFile(filename),bytes);
await fs.writeFile(filename,'user-edited-copy');
await exportImage(input,config);
assert.equal(await fs.readFile(filename,'utf8'),'user-edited-copy');
const before=requests;
await assert.rejects(exportImage({...input,projectId:'../elsewhere'},config),/无效/);
await assert.rejects(exportImage({...input,mediaId:'https://example.com'},config),/无效/);
assert.equal(requests,before);
await assert.rejects(exportImage(input,{...config,fetchImage:async()=>new Response('missing',{status:404})}),/无法读取/);
await assert.rejects(exportImage(input,{...config,fetchImage:async()=>new Response('<script>',{headers:{'content-type':'text/html'}})}),/不是支持/);
console.log('PASS: authenticated local image export, safe directory and filename, correct bytes/extension, preserve existing files, invalid IDs and missing/non-image rejection.');

await fs.writeFile(filename,bytes);
let uploads=0,authorized=0;
let expectedPickerPath=await fs.realpath(path.dirname(filename));
const chooseConfig={...config,authorize:async()=>{authorized++;},pick:async options=>{
  assert.equal(options.defaultPath,expectedPickerPath);assert.deepEqual(options.properties,['openFile']);
  return {canceled:false,filePaths:[filename]};
},fetchImage:async(url,init)=>{
  if(init.method!=='POST')return config.fetchImage(url,init);
  uploads++;assert.equal(url,`${config.origin}/api/media`);assert.equal(init.headers.Cookie,'director_session=test-only');
  const file=init.body.get('file');assert.equal(file.type,'image/png');assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytes);
  return Response.json({id,name:'历史图片',type:'image/png',url:`/api/media/${id}`});
}};
assert.equal((await chooseImage(input,chooseConfig)).media.id,id);
expectedPickerPath=await fs.realpath(path.dirname(filename));
assert.equal((await chooseImage({projectId:input.projectId}, {...chooseConfig,pick:async options=>{assert.equal(options.defaultPath,expectedPickerPath);return {canceled:false,filePaths:[filename]};}})).media.id,id);
assert.equal(uploads,2);assert.equal(authorized,2);
assert.deepEqual(await chooseImage({projectId:input.projectId},{...chooseConfig,pick:async()=>({canceled:true,filePaths:[]})}),{canceled:true});
assert.equal(uploads,2);
await assert.rejects(chooseImage({projectId:'../escape'},chooseConfig),/无效/);
await fs.writeFile(filename,'invalid-image');
await assert.rejects(chooseImage({projectId:input.projectId},chooseConfig),/有效/);
assert.equal(uploads,2);
console.log('PASS: image picker existing/cleared asset, cancel, authorization, authenticated upload, signature and path checks.');

assert.equal(imageFolder('project-a','/Pictures/account-a',path.posix),'/Pictures/account-a/AI短片导演/project-a');
assert.equal(imageFolder('project-b','C:/Users/B/Pictures/account-b',path.win32),'C:\\Users\\B\\Pictures\\account-b\\AI短片导演\\project-b');
console.log('PASS: native picker exact project directory and Mac/Windows dynamic paths.');
