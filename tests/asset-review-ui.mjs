// Server-render the real asset dialog; unrelated media/network dependencies are inert.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {newProject} from '../work/test/studio.mjs';
const source = await fs.readFile('components/project-asset-dialog.tsx','utf8');
const wrap = tag => function Wrapper({children,...props}) {return React.createElement(tag, {className:props.className}, children);};
const imports = {
  react:React,'react/jsx-runtime':jsx,
  'next/image':{default:wrap('img')},
  '@/components/ui/button':{Button:wrap('button')},
  '@/components/ui/checkbox':{Checkbox:wrap('input')},
  '@/components/ui/dialog':Object.fromEntries(['Dialog','DialogContent','DialogHeader','DialogTitle','DialogDescription'].map(k => [k,wrap('div')])),
  '@/lib/asset-library':{libraryEntries:()=>[]},
  '@/lib/asset-image-skill':{assetImageSkills:()=>[],defaultAssetImageSkill:()=>undefined,selectedAssetImageSkill:()=>undefined,assetImageSkill:()=>undefined,assetImagePrompt:()=>'',wantsThreeViews:()=>false},
  '@/lib/studio':{id:()=> 'unused'},
  './skill-center':{BusinessSelect:wrap('select')},
  './asset-image-preview':{AssetImagePreview:wrap('div'),ImageFileButton:wrap('button')},
};
const context = {exports:{},require:name=>imports[name] || {},console};
vm.createContext(context);
vm.runInContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);
const project = newProject('资产复核');
project.assets = [
  {id:'role',kind:'人物',name:'小林',description:'原设定',suggestedDescription:'红色外套',evidence:'小林穿红色外套。'},
  {id:'empty',kind:'人物',name:'小王',description:''},
];
const html = renderToStaticMarkup(React.createElement(context.exports.ProjectAssetDialog,{
  open:true,kind:'人物',project,projects:[],disabled:false,generationJobs:[],onReviewAssets(){},
}));
assert(!html.includes('红色外套'),'suggested descriptions no longer appear below asset inputs');
assert(!html.includes('小林穿红色外套。'),'evidence is kept as data without rendering in the dialog');
assert(!html.includes('采用新描述'));
assert(!html.includes('描述待补充'));
assert(html.includes('原设定'),'current description stays editable');
assert(html.includes('识别状态'),'asset extraction progress/retry must be reachable from the dialog');
console.log('PASS asset dialog keeps editing/review entry and removes evidence/conflict/empty helper blocks');
