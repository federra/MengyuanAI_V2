// Render the actual workbench status branch with real React and task labels.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {generationTaskName} from '../work/test/creative.mjs';
const source = await fs.readFile('app/page.tsx','utf8');
const branch = source.match(/\{aiGenerating && ([\s\S]*?<\/output>)\}/)[1];
const context={exports:{},require:()=>jsx,generationTaskName,Sparkles:()=>null};
vm.createContext(context);
vm.runInContext(ts.transpileModule(`export function indicator(aiGenerating,aiGenerationDetail){return (${branch});}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
for(const [task,label] of [['storyOptions','故事方案'],['script','剧本'],['shots','分镜'],['video','视频']]) {
  const html=renderToStaticMarkup(context.exports.indicator(task,''));
  assert(html.includes(label));
  assert(!html.includes('AI努力生成中'));
}
assert(renderToStaticMarkup(context.exports.indicator('shots','正在处理剧本第1/2段')).includes('第1/2段'));
console.log('PASS actual generation indicator names its output and shows storyboard progress');
