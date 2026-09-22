import { parseStoryboardImport, applyStoryboardImport } from './director';
import { newProject } from './studio';

// Recognized external-agent format: map fields without asking a model to rewrite dialogue.
function adaptAgentStoryboards(source: string): string | undefined {
  try {
    const data = JSON.parse(source);
    if (!data || !Array.isArray(data.storyboards) || !data.storyboards.length || data.shots || data.episodes) return;
    const rows: Record<string, unknown>[] = data.storyboards;
    const definitions = new Map<string, {kind: string; name: string; description: string}>();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || typeof row.prompt !== 'string' || !row.prompt.trim() || typeof row.content !== 'string') return;
      const missing = row.missing_elements as Record<string, unknown> | undefined;
      if (!missing || typeof missing !== 'object') return;
      for (const [group, prefix, kind] of [['missing_roles','role','人物'],['missing_scenes','scene','场景'],['missing_props','prop','道具']]) {
        const entries = missing[group];
        if (!Array.isArray(entries)) return;
        for (const value of entries) {
          if (!value || typeof value !== 'object') return;
          const key = value[`${prefix}_id`], name = value[`${prefix}_name`];
          if (typeof key !== 'string' || typeof name !== 'string' || !name.trim() || typeof value.description !== 'string') return;
          const description = [value.description, typeof value.visual_style === 'string' ? value.visual_style : ''].filter(Boolean).join('\n');
          const asset = {kind, name, description};
          const old = definitions.get(key);
          if (old && JSON.stringify(old) !== JSON.stringify(asset)) return;
          if ([...definitions.entries()].some(([id,a])=>id!==key && a.kind===kind && a.name===name)) return;
          definitions.set(key,asset);
        }
      }
    }
    const voices = data.voice_registry ?? {};
    if (!voices || typeof voices !== 'object' || Array.isArray(voices)) return;
    const voiceNames = new Map<string,string>();
    const assets = [...definitions.values()];
    for (const [key, voice] of Object.entries(voices)) {
      const role = definitions.get(key);
      if (!role || role.kind !== '人物' || typeof voice !== 'string') return;
      const voiceName = `${role.name}音色`;
      voiceNames.set(role.name,voiceName);
      assets.push({kind:'声音',name:voiceName,description:voice});
    }
    const shots = [];
    for (const [index,row] of rows.entries()) {
      const rawDuration = row.duration;
      if (typeof rawDuration !== 'number' && (typeof rawDuration !== 'string' || !/^\s*\d+(?:\.\d+)?\s*(?:s|秒)?\s*$/.test(rawDuration))) return;
      const duration = typeof rawDuration === 'number' ? rawDuration : parseFloat(rawDuration as string);
      const refs = [];
      for (const [field, kind] of [['role_ids','人物'],['scene_ids','场景'],['prop_ids','道具']]) {
        const ids = row[field];
        if (!Array.isArray(ids)) return;
        for (const key of ids) {
          const asset = definitions.get(key);
          if (!asset || asset.kind !== kind) return;
          refs.push({kind:asset.kind,name:asset.name});
        }
      }
      const lines = [];
      for (const line of (row.content as string).split(/\r?\n/).filter(x=>x.trim())) {
        const parts = line.split('|');
        if (parts.length !== 4 || !['台词','旁白'].includes(parts[0])) return;
        const [kind,speaker,text,emotion] = parts;
        const voiceName = voiceNames.get(speaker) || '';
        lines.push({kind,speaker,text,emotion,voiceName});
        if (voiceName && !refs.some(a=>a.kind==='声音' && a.name===voiceName)) refs.push({kind:'声音',name:voiceName});
      }
      const {prompt,content:_content,...metadata} = row;
      // Retain source material, continuity, source IDs and audit metadata as notes.
      const notes = JSON.stringify({...metadata,...(index===0 ? {source_metadata:Object.fromEntries(Object.entries(data).filter(([k])=>k!=='storyboards'))} : {})});
      shots.push({title:typeof row.id==='string'?row.id:`分镜${index+1}`,duration,description:prompt,prompt,lines,assetNames:refs,character:refs.filter(a=>a.kind==='人物').map(a=>a.name).join('、'),scene:refs.filter(a=>a.kind==='场景').map(a=>a.name).join('、'),sourceMetadata:notes});
    }
    return JSON.stringify({shots,assets});
  } catch { return; }
}

export async function normalizeStoryboard(
  source: string,
  convert: (source: string, reason: string) => Promise<string>,
) {
  if (typeof source !== 'string' || !source.trim() || source.length > 2_000_000)
    throw Error('分镜内容为空或超过200万字，原项目未修改。');
  const validate = (text: string) => {
    const parsed = parseStoryboardImport(text);
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { /* The parser supports safe JSON presentation repairs. */ }
    const legacy = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && 'shots' in raw ? raw.shots : undefined;
    if (Array.isArray(legacy) && legacy.some(row => row && typeof row === 'object' &&
      ((row.content && !row.lines && !row.dialogue) || row.missing_elements ||
        ((row.role_ids || row.scene_ids || row.prop_ids) && !row.assetNames))))
      throw Error('存在未映射的台词或资产字段，需要转换为分镜模板。');
    applyStoryboardImport(newProject('格式校验'), text, 'replace');
    return parsed;
  };
  let reason = '';
  try { return { text: source, converted: false, storyboard: validate(source) }; }
  catch (e) { reason = e instanceof Error ? e.message : '格式不符合模板'; }
  const adapted = adaptAgentStoryboards(source);
  if (adapted) {
    try { return {text:adapted,converted:true,storyboard:validate(adapted)}; }
    catch { /* Unsupported limits still use the existing conversion/error flow. */ }
  }
  if (source.length > 60000) throw Error('待转换分镜超过60000字，请分批导入；原内容未修改。');
  // Conversion may change fields, but never merge/drop existing video segments.
  let rows: Record<string, unknown>[] | undefined;
  try {
    const data = JSON.parse(source);
    const list = Array.isArray(data) ? data : data.episodes ?? data.shots ?? data.storyboards;
    if (Array.isArray(list)) rows = list;
  } catch { /* Invalid JSON can still be converted once, then reviewed by the user. */ }
  const text = await convert(source, reason);
  let storyboard: ReturnType<typeof validate>;
  try { storyboard = validate(text); }
  catch (e) { throw Error(`格式转换后仍未通过校验：${e instanceof Error ? e.message : '格式不正确'}。原内容未修改。`); }
  if (rows) {
    if (rows.length !== storyboard.shots.length) throw Error('格式转换改变了视频段数量，未采用转换结果。');
    rows.forEach((row, i) => {
      if (!row || typeof row !== 'object') return;
      const originalLines = Array.isArray(row.lines) ? row.lines.flatMap(line =>
        line && typeof line === 'object' && typeof line.text === 'string' ? [line.text] : [])
        : typeof row.content === 'string' ? row.content.split(/\r?\n/).flatMap(line => {
          const parts = line.split('|'); return parts.length === 4 ? [parts[2]] : [];
        }) : [];
      const convertedLines = storyboard.shots[i].lines?.map(line => line.text) || [];
      if (originalLines.some((line, index) => convertedLines[index] !== line))
        throw Error(`格式转换改变了第${i + 1}段原台词，未采用转换结果。`);
      const duration = row.total_duration ?? row.duration;
      const seconds = typeof duration === 'number' ? duration : typeof duration === 'string' && /^\s*\d+(?:\.\d+)?\s*(?:s|秒)?\s*$/.test(duration) ? parseFloat(duration) : NaN;
      if (Number.isFinite(seconds) && Math.abs(seconds - storyboard.shots[i].duration) > 0.001)
        throw Error(`格式转换改变了第${i + 1}段时长，未采用转换结果。`);
    });
  }
  return { text, converted: true, storyboard };
}
