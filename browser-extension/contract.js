export function validateBundle(b){
  if(!b||b.format!=='director-doubao-task'||b.version!==1||typeof b.projectId!=='string'||!Array.isArray(b.tasks)||!b.tasks.length||b.tasks.length>200||!Array.isArray(b.media))throw Error('请选择工作台导出的豆包任务 JSON');
  const media=new Map();
  for(const m of b.media){if(!m||typeof m.id!=='string'||media.has(m.id)||!['image/png','image/jpeg','image/webp'].includes(m.type)||typeof m.dataUrl!=='string'||!m.dataUrl.startsWith(`data:${m.type};base64,`)||!/^[A-Za-z0-9+/]*={0,2}$/.test(m.dataUrl.split(',')[1]||''))throw Error('任务包参考图无效');media.set(m.id,m);}
  const ids=new Set();
  for(const t of b.tasks){if(!t||typeof t.id!=='string'||ids.has(t.id)||typeof t.title!=='string'||typeof t.prompt!=='string'||!t.prompt.trim()||t.prompt.length>20000||!Array.isArray(t.references)||new Set(t.references.map(r=>r.mediaId)).size!==t.references.length||t.references.some(r=>!media.has(r.mediaId)||typeof r.label!=='string'))throw Error('任务包分镜或图片顺序无效');ids.add(t.id);}
  return b;
}
export function safeName(name){return String(name||'素材').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,120);}
