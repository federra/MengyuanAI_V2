import fs from 'node:fs/promises';import ts from 'typescript';import vm from 'node:vm';import assert from 'node:assert/strict';
const c={exports:{},require(){return {}}};vm.createContext(c);vm.runInContext(ts.transpileModule(await fs.readFile('lib/models.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,c);
const {imageSizeForRatio,resolveImageSize}=c.exports;
for(const ratio of ['16:9','9:16','1:1','4:3','3:4','21:9','2.35:1']){
 const size=imageSizeForRatio(ratio,'seedream'),[w,h]=size.split('x').map(Number);assert(w*h>=3686400,ratio+' must meet minimum area');assert(Math.abs(w/h-ratio.split(':').map(Number).reduce((a,b)=>a/b))<0.01);
}
assert.equal(imageSizeForRatio('16:9'),'2048x1152');
assert.equal(resolveImageSize('2048x1152','seedream'),'2560x1440');
assert.equal(resolveImageSize('2K','seedream'),'2K');assert.equal(resolveImageSize('4K','seedream'),'4K');
assert.equal(resolveImageSize('1024x1024','images'),'1024x1024');
assert.throws(()=>resolveImageSize('4096x256','seedream'),/尺寸/);
console.log('PASS Seedream minimum pixels, ratios, legacy dimensions and other model isolation');
const {imageSizeOptions}=c.exports;
assert.deepEqual(Array.from(imageSizeOptions('images','dall-e-3')),['1024x1024','1792x1024','1024x1792']);
assert.equal(imageSizeForRatio('16:9','images','gpt-image-1'),'1536x1024');
assert.equal(imageSizeForRatio('9:16','images','dall-e-3'),'1024x1792');
assert.equal(imageSizeForRatio('21:9','images','dall-e-2'),'1024x1024');
for (const name of ['gpt-image-1','dall-e-2','dall-e-3']) {
 for (const ratio of ['16:9','9:16','1:1','4:3','3:4','21:9','2.35:1']) assert(imageSizeOptions('images',name).includes(imageSizeForRatio(ratio,'images',name)));
 for (const size of imageSizeOptions('images',name)) assert.equal(resolveImageSize(size,'images',name),size);
 assert.throws(()=>resolveImageSize('2K','images',name),/尺寸/);
}
console.log('PASS all image menu sizes and model-specific compatible defaults');
