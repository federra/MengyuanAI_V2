import type { Asset } from './studio';
export type PromptPart = { text: string; asset?: Asset };
export function promptParts(text: string, assets: Asset[]): PromptPart[] {
  const names = new Map<string, Asset>();
  for (const a of assets)
    if (a.name.trim() && assets.filter((x) => x.name === a.name).length === 1)
      names.set(a.name, a);
  if (!names.size) return [{ text }];
  const pattern = [...names.keys()]
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const regex = new RegExp(pattern, 'g');
  const result: PromptPart[] = [];
  let start = 0;
  for (const match of text.matchAll(regex)) {
    if (match.index > start)
      result.push({ text: text.slice(start, match.index) });
    result.push({ text: match[0], asset: names.get(match[0]) });
    start = match.index + match[0].length;
  }
  if (start < text.length) result.push({ text: text.slice(start) });
  return result.length ? result : [{ text }];
}
