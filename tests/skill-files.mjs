import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {zipSync,strToU8} from 'fflate';
for(const name of ['skill-files','skill-quality']) {
 const source=await fs.readFile(`lib/${name}.ts`,'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll("'./export'","'./export.mjs'").replaceAll("'./skill-quality'","'./skill-quality.mjs'");
 await fs.writeFile(`work/test/${name}.mjs`,code);
}
const {exportSkillFile,readSkillFile}=await import('../work/test/skill-files.mjs');
const {inspectSkillFile}=await import('../work/test/skill-quality.mjs');
const skill={id:'test',name:'故事技能',stage:'故事',version:'1.0',content:'保留原文换行。\n\n生成三个完整故事。'};
for(const format of ['json','txt','md','zip']) {
 const out=exportSkillFile(skill,format);const result=await readSkillFile(new File([out.data],out.name));
 assert.deepEqual(inspectSkillFile(result.source).skill,(({id,...rest})=>rest)(skill));
}
const archive=(entries)=>new File([zipSync(Object.fromEntries(Object.entries(entries).map(([name,text])=>[name,strToU8(text)])))],'skill.zip');
const packaged=await readSkillFile(archive({'example/SKILL.md':'# Story skill\nUse references/guide.md.','example/references/guide.md':'Keep characters consistent.'}));
assert.match(packaged.source,/Keep characters consistent/);
await assert.rejects(readSkillFile(archive({'a/SKILL.md':'one','b/SKILL.md':'two'})),/多个/);
await assert.rejects(readSkillFile(archive({'../SKILL.md':'bad'})),/路径/);
await assert.rejects(readSkillFile(archive({'SKILL.md':'x'.repeat(100001)})),/100KB/);
await assert.rejects(readSkillFile(new File(['not a zip'],'bad.zip')),/ZIP/);
console.log('PASS four skill formats round-trip, nested package references, ambiguity, traversal, size and corrupt archive guards.');
const longSkill={...skill,content:'中'.repeat(20000)};
const longExport=exportSkillFile(longSkill,'zip');
assert.equal(inspectSkillFile((await readSkillFile(new File([longExport.data],longExport.name))).source).skill.content,longSkill.content);
console.log('PASS maximum-length Chinese skill ZIP round-trip.');
