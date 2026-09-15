import { id, type Asset, type Project, type Shot } from './studio';
import { dialogueLines } from './dialogue';

export const assetKinds = [
  '人物',
  '道具',
  '场景',
  '服饰',
  '声音',
  '风格',
  '站位图',
] as const;
export type AssetDraft = {
  kind: string;
  name: string;
  description: string;
  evidence: string;
};

export function parseAssetDrafts(value: unknown, script: string): AssetDraft[] {
  const rows = (value as { assets?: unknown })?.assets;
  if (!Array.isArray(rows) || rows.length > 200)
    throw Error('资产清单格式错误，最多200项');
  const found = new Set<string>();
  return rows.map((a: AssetDraft) => {
    if (
      !a ||
      !assetKinds.includes(a.kind as (typeof assetKinds)[number]) ||
      typeof a.name !== 'string' ||
      !a.name.trim() ||
      a.name.length > 150 ||
      typeof a.description !== 'string' ||
      a.description.length > 10000 ||
      typeof a.evidence !== 'string' ||
      !a.evidence.trim() ||
      a.evidence.length > 2000 ||
      !script.includes(a.evidence)
    )
      throw Error('资产缺少有效分类、名称或剧本原文依据');
    const result = {
      kind: a.kind,
      name: a.name.trim(),
      description: a.description,
      evidence: a.evidence,
    };
    const key = result.kind + ':' + result.name;
    if (found.has(key)) throw Error('资产清单包含重复名称');
    found.add(key);
    return result;
  });
}

// Preserve verified rows while reporting unsupported evidence instead of losing the entire batch.
export function reviewAssetDrafts(value: unknown, script: string) {
  const rows = (value as { assets?: unknown })?.assets;
  if (!Array.isArray(rows) || rows.length > 200)
    throw Error('资产清单格式错误，最多200项');
  const assets: AssetDraft[] = [];
  const warnings: string[] = [];
  const names = new Set<string>();
  const compact = (s: string) => s.replace(/\s+/g, '');
  const normalized = compact(script);
  for (const [index, row] of rows.entries()) {
    let candidate = row;
    if (
      row &&
      typeof row.evidence === 'string' &&
      row.evidence.trim() &&
      !script.includes(row.evidence)
    ) {
      const evidence = compact(row.evidence);
      const at = evidence ? normalized.indexOf(evidence) : -1;
      if (at >= 0) {
        let count = 0,
          start = -1,
          end = -1;
        for (let i = 0; i < script.length; i++)
          if (!/\s/.test(script[i])) {
            if (count === at) start = i;
            count++;
            if (count === at + evidence.length) {
              end = i + 1;
              break;
            }
          }
        if (start >= 0 && end > start)
          candidate = { ...row, evidence: script.slice(start, end) };
      }
    }
    try {
      const [item] = parseAssetDrafts({ assets: [candidate] }, script);
      const key = item.kind + ':' + item.name;
      if (names.has(key)) {
        warnings.push(`第${index + 1}项重复资产已合并。`);
        continue;
      }
      names.add(key);
      assets.push(item);
    } catch {
      warnings.push(
        `第${index + 1}项分类、名称或原文依据无效，未自动加入，请人工复核。`,
      );
    }
  }
  // Explicit script labels are grounded in the original text, even if the model omitted them.
  for (const item of explicitAssets(script)) {
    const key = item.kind + ':' + item.name;
    if (!names.has(key)) {
      names.add(key);
      assets.push(item);
    }
  }
  if (assets.length > 200) throw Error('资产超过200项，请按集整理剧本。');
  if (rows.length && !assets.length)
    throw Error(
      '本次模型资产均缺少可验证的原文依据，未修改资产。请检查剧本标签或重试。',
    );
  return { assets, warnings };
}

// Without a model only explicit labels and dialogue speakers are extracted.
export function explicitAssets(script: string): AssetDraft[] {
  const result = new Map<string, AssetDraft>();
  const add = (kind: string, name: string, evidence: string) => {
    name = name.trim();
    if (!name || name.length > 150 || /^(无|暂无|无对白|待定)$/.test(name))
      return;
    result.set(kind + ':' + name, {
      kind,
      name,
      description: '',
      evidence: evidence.slice(0, 2000),
    });
  };
  for (const raw of script.split('\n')) {
    const line = raw.replace(/\*\*/g, '').trim();
    for (const match of line.matchAll(
      /(?:^|[；;｜|])\s*(人物|道具|场景|服饰|声音)[：:]\s*([^；;｜|\n]+)/g,
    )) {
      for (const name of match[2].split(/[、，,]/)) add(match[1], name, raw);
    }
    const speaker = line.match(
      /^([\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z0-9· ]{0,19})[：:]\s*[“「"']/u,
    );
    if (
      speaker &&
      !assetKinds.includes(speaker[1] as (typeof assetKinds)[number])
    ) {
      add('人物', speaker[1], raw);
      add('声音', speaker[1] + '配音', raw);
    }
  }
  if (result.size > 200) throw Error('资产超过200项，请按集拆分剧本');
  return [...result.values()];
}

export function matchShotAssets(shot: Shot, assets: Asset[]): Shot {
  const text = [
    shot.title,
    shot.description,
    shot.scene,
    shot.character,
    shot.dialogue,
  ].join('\n');
  const refs = new Set(
    shot.references.filter((ref) => assets.some((a) => a.id === ref)),
  );
  const lines = dialogueLines(shot);
  for (const a of assets) {
    const lineMatch = lines.some(
      (l) =>
        (a.kind === '人物' && a.name === l.speaker) ||
        (a.kind === '声音' && a.name === l.voiceName),
    );
    const named = shot.assetNames?.some(
      (n) => n.kind === a.kind && n.name === a.name,
    );
    const sound =
      a.kind === '声音' &&
      a.name.endsWith('配音') &&
      !!shot.dialogue.trim() &&
      shot.character.split(/[、，, /]/).includes(a.name.slice(0, -2));
    if (lineMatch || named || sound || text.includes(a.name)) refs.add(a.id);
  }
  return { ...shot, references: [...refs] };
}

export function mergeScriptAssets(
  p: Project,
  drafts: AssetDraft[],
  mode: 'model' | 'labels',
): Project {
  const assets = p.assets.map((a) => ({ ...a }));
  for (const draft of drafts) {
    const existing = assets.find(
      (a) => a.kind === draft.kind && a.name === draft.name,
    );
    if (existing) {
      existing.evidence = draft.evidence;
      if (!existing.description.trim())
        existing.description = draft.description;
      if (
        draft.description.trim() &&
        existing.description !== draft.description
      )
        existing.suggestedDescription = draft.description;
      else delete existing.suggestedDescription;
    } else assets.push({ id: id(), ...draft });
  }
  if (assets.length > 200) throw Error('资产总量超过200项，请先整理资产');
  const scriptChanged =
    p.assetScript !== undefined && p.assetScript !== p.script;
  return {
    ...p,
    assets,
    assetScript: p.script,
    assetMode: mode,
    shots: p.shots.map((s) => ({
      ...matchShotAssets(s, assets),
      ...(scriptChanged
        ? { reviewRequired: '剧本已更新，请复核资产引用、人物造型与声音' }
        : {}),
    })),
  };
}
