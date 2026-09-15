const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {pipeline}=require('node:stream/promises');
const {Readable}=require('node:stream');
const {createWriteStream}=require('node:fs');
const run=promisify(execFile),uid=()=>randomUUID().toUpperCase();
const us=n=>Math.round(n*1000000);
const safe=s=>String(s||'未命名').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,55)||'未命名';
const clip=y=>({alpha:1,flip:{horizontal:false,vertical:false},rotation:0,scale:{x:1,y:1},transform:{x:0,y:y||0}});
async function probe(file){
  const {stdout}=await run(require('ffprobe-static').path,['-v','error','-show_streams','-show_format','-of','json',file],{windowsHide:true,timeout:30000,maxBuffer:2000000});
  const data=JSON.parse(stdout),video=data.streams?.find(s=>s.codec_type==='video');
  return {width:video?.width,height:video?.height,duration:Number(data.format?.duration||data.streams?.[0]?.duration||0)};
}
async function exportJianying(input,{draftDir,origin,token,fetchMedia=fetch,probeMedia=probe}){
  const p=input?.project;
  if(!p||!Array.isArray(p.shots)||p.shots.length>200||!Array.isArray(input.cues)||JSON.stringify(input).length>12000000)throw Error('导出项目格式不正确');
  const shots=p.shots.filter(s=>s.enabled);
  if(!shots.length)throw Error('请至少启用一个分镜');
  for(const s of shots)if(!Number.isFinite(s.duration)||s.duration<=0||s.duration>120||!Number.isFinite(s.trimStart)||s.trimStart<0||(!s.video&&!s.image))throw Error(`分镜“${s.title}”缺少画面或时长不正确，请补齐后导出`);
  if(!path.isAbsolute(draftDir))throw Error('请先设置剪映草稿目录');
  await fs.mkdir(draftDir,{recursive:true});
  const id=uid(),name=safe(p.title)+'-'+new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14)+'-'+id.slice(0,6);
  const final=path.join(draftDir,name),stage=path.join(draftDir,'.director-export-'+id);
  await fs.mkdir(path.join(stage,'Resources'),{recursive:true});
  const content=JSON.parse(await fs.readFile(path.join(__dirname,'jianying-templates/content.json'),'utf8'));
  const dims={'16:9':[1920,1080],'9:16':[1080,1920],'1:1':[1080,1080]}[p.ratio]||[1920,1080];
  Object.assign(content,{id,name,create_time:Date.now()*1000,update_time:Date.now()*1000,canvas_config:{width:dims[0],height:dims[1],ratio:p.ratio},tracks:[]});
  const materials=content.materials,cache=new Map();
  const track=(type,name)=>{const t={id:uid(),type,name,attribute:0,flag:0,is_default_name:false,segments:[]};content.tracks.push(t);return t;};
  const videoTrack=track('video','分镜画面'),audioTracks=[],textTracks=[];
  const lane=(list,type,name,start)=>{let t=list.find(t=>t.segments.at(-1).target_timerange.start+t.segments.at(-1).target_timerange.duration<=start);if(!t){t=track(type,name+(list.length+1));list.push(t);}return t;};
  const segment=(material,start,duration,source=0,volume=1,visual=false,y=0)=>{
    const speedId=uid();materials.speeds.push({id:speedId,type:'speed',mode:0,speed:1,curve_speed:null});
    return {id:uid(),material_id:material.id,target_timerange:{start,duration},source_timerange:{start:source,duration},speed:1,volume,last_nonzero_volume:1,reverse:false,visible:true,track_attribute:0,track_render_index:0,enable_adjust:true,enable_color_curves:true,enable_color_wheels:true,enable_lut:true,common_keyframes:[],keyframe_refs:[],extra_material_refs:[speedId],is_tone_modify:false,...(visual?{clip:clip(y),uniform_scale:{on:true,value:1}}:{})};
  };
  async function media(m,kind){
    if(cache.has(m.id)){const cached=cache.get(m.id);if((cached.type==='extract_music')!==(kind==='audio'))throw Error('素材类型不匹配：'+m.name);return cached;}
    if(!/^[a-f0-9-]{36}$/i.test(m.id||''))throw Error('素材编号无效');
    const response=await fetchMedia(origin+'/api/media/'+m.id,{headers:{Cookie:`director_session=${token}`},redirect:'error',signal:AbortSignal.timeout(120000)});
    const type=response.headers.get('content-type')?.split(';')[0];
    const ext={'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','image/png':'png','image/jpeg':'jpg','image/webp':'webp','audio/mpeg':'mp3','audio/wav':'wav','audio/x-wav':'wav','audio/mp4':'m4a','audio/ogg':'ogg','audio/webm':'webm'}[type];
    if(!response.ok||!ext||!response.body)throw Error('素材无法读取：'+m.name);
    const rel=path.join('Resources',m.id+'.'+ext),file=path.join(stage,rel);
    await pipeline(Readable.fromWeb(response.body),createWriteStream(file,{flags:'wx'}));
    if(!(await fs.stat(file)).size)throw Error('素材为空：'+m.name);
    const info=await probeMedia(file),photo=type.startsWith('image/'),audio=type.startsWith('audio/');
    if(audio!==(kind==='audio'))throw Error('素材类型不匹配：'+m.name);
    if(!photo&&(!Number.isFinite(info.duration)||info.duration<=0))throw Error('无法读取素材时长：'+m.name);
    if(!audio&&(!info.width||!info.height))throw Error('无法读取画面尺寸：'+m.name);
    const mat={id:uid(),path:path.join(final,rel).replaceAll('\\','/'),duration:photo?10800000000:us(info.duration),type:audio?'extract_music':photo?'photo':'video',name:m.name,material_name:m.name,category_id:'',category_name:'local',local_material_id:'',source_platform:0};
    if(audio)Object.assign(mat,{app_id:0,check_flag:3,copyright_limit_type:'none',effect_id:'',formula_id:'',music_id:mat.id,wave_points:[]});
    else Object.assign(mat,{material_id:mat.id,width:info.width,height:info.height,check_flag:63487,audio_fade:null,media_path:'',crop_ratio:'free',crop_scale:1,crop:{upper_left_x:0,upper_left_y:0,upper_right_x:1,upper_right_y:0,lower_left_x:0,lower_left_y:1,lower_right_x:1,lower_right_y:1}});
    materials[audio?'audios':'videos'].push(mat);cache.set(m.id,mat);return mat;
  }
  let cursor=0;
  try{
    for(const s of shots){
      const duration=us(s.duration),v=await media(s.video||s.image,'visual'),source=s.video?us(s.trimStart):0;
      if(v.duration-source<duration-100000)throw Error(`分镜“${s.title}”的视频不足设定时长，请调整裁切或时长`);
      const cues=input.cues.filter(c=>c.shotId===s.id);
      const hasVoice=cues.some(c=>c.audio)||!!s.audio;
      videoTrack.segments.push(segment(v,cursor,duration,source,hasVoice?0:1,true));
      for(const c of cues){
        if(!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end>s.duration+.001||c.end<=c.start)throw Error('字幕时间段不正确');
        const start=cursor+us(c.start),length=us(c.end-c.start);
        if(c.text?.trim()){
          const t={id:uid(),type:'subtitle',content:JSON.stringify({text:c.text,styles:[{range:[0,Array.from(c.text).length],size:8,bold:false,italic:false,underline:false,strokes:[],fill:{alpha:1,content:{render_type:'solid',solid:{alpha:1,color:[1,1,1]}}}}]}),alignment:1,typesetting:0,letter_spacing:0,line_spacing:.02,line_feed:1,line_max_width:.82,force_apply_line_max_width:false,check_flag:7,global_alpha:1};
          materials.texts.push(t);const seg=segment(t,start,length,0,1,true,-.8);seg.source_timerange=null;lane(textTracks,'text','字幕',start).segments.push(seg);
        }
        if(c.audio){const a=await media(c.audio,'audio'),src=us(Number(c.audioStart)||0),len=Math.min(length,a.duration-src);if(!Number.isFinite(src)||src<0||len<=0)throw Error('配音裁切超出素材时长');lane(audioTracks,'audio','配音',start).segments.push(segment(a,start,len,src));}
      }
      if(s.audio&&!cues.some(c=>c.audio)){const a=await media(s.audio,'audio');lane(audioTracks,'audio','配音',cursor).segments.push(segment(a,cursor,Math.min(duration,a.duration)));}
      cursor+=duration;
    }
    if(p.bgm){const a=await media(p.bgm,'audio');if(a.duration<100000)throw Error('背景音乐不足0.1秒，请更换素材');const bgm=track('audio','背景音乐');for(let at=0;at<cursor;at+=a.duration)bgm.segments.push(segment(a,at,Math.min(a.duration,cursor-at),0,.2));}
    content.duration=cursor;
    content.tracks.forEach((t,i)=>t.segments.forEach(s=>{s.render_index=i;}));
    const meta=JSON.parse(await fs.readFile(path.join(__dirname,'jianying-templates/meta.json'),'utf8'));
    Object.assign(meta,{draft_id:id,draft_name:name,draft_fold_path:final,draft_root_path:draftDir,draft_json_file:path.join(final,'draft_content.json'),tm_draft_create:Date.now()*1000,tm_draft_modified:Date.now()*1000,tm_duration:cursor});
    await fs.writeFile(path.join(stage,'draft_content.json'),JSON.stringify(content));
    await fs.writeFile(path.join(stage,'draft_meta_info.json'),JSON.stringify(meta));
    await fs.writeFile(path.join(stage,'source-project.json'),JSON.stringify(p,null,2));
    await fs.writeFile(path.join(stage,'subtitles.srt'),String(input.srt||''));
    await fs.rename(stage,final);
    return {ok:true,path:final,name,shots:shots.length,duration:cursor/1000000};
  }catch(e){await fs.writeFile(path.join(stage,'export-error.txt'),e.message).catch(()=>{});throw e;}
}
module.exports={exportJianying,probe};
