import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const {exportJianying,probe}=createRequire(import.meta.url)('./jianying-export.cjs');
const fixtures=process.argv[2],draftDir=process.argv[3];
if(!fixtures||!draftDir)throw Error('Provide fixture and destination directories');
const media=['video.mp4','photo.png','audio.wav'].map((name,i)=>({id:randomUUID(),name,type:['video/mp4','image/png','audio/wav'][i]}));
for(const m of media){const info=await probe(path.join(fixtures,m.name));if(m.type.startsWith('image'))assert.equal(info.width,640);else assert(info.duration>=2);}
const input={project:{title:'AI导演草稿格式验证',ratio:'16:9',shots:[{id:'a',title:'蓝色测试画面',enabled:true,duration:2,trimStart:1,video:media[0]},{id:'b',title:'绿色测试画面',enabled:true,duration:3,trimStart:0,image:media[1]}],bgm:media[2]},cues:[{shotId:'a',text:'第一段：视频与配音',start:0,end:2,audio:media[2],audioStart:0},{shotId:'b',text:'第二段：静态图片',start:0,end:3}],srt:'1\n00:00:00,000 --> 00:00:02,000\n第一段：视频与配音\n\n2\n00:00:02,000 --> 00:00:05,000\n第二段：静态图片\n'};
const result=await exportJianying(input,{draftDir,origin:'http://127.0.0.1',token:'fixture',fetchMedia:async(url)=>{const m=media.find(m=>url.endsWith(m.id));return new Response(await fs.readFile(path.join(fixtures,m.name)),{headers:{'content-type':m.type}});}});
const content=JSON.parse(await fs.readFile(path.join(result.path,'draft_content.json'),'utf8'));
assert.equal(content.duration,5000000);for(const m of [...content.materials.videos,...content.materials.audios])await fs.access(m.path);
console.log(JSON.stringify(result,null,2));
