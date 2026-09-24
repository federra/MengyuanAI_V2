type ExistingAsset = { kind: string; name: string; description: string };

export type StoryboardGenerationInput = {
  script: string;
  ratio?: string;
  videoType?: string;
  style?: string;
  shotSkill?: unknown;
  assets?: ExistingAsset[];
};

// Keep every script character and prefer scene/paragraph boundaries over hard cuts.
export function splitStoryboardScript(script: string, limit = 1400): string[] {
  const parts: string[] = [];
  let rest = script;
  while (rest.length > limit) {
    const floor = Math.floor(limit * 0.6);
    const window = rest.slice(floor, limit);
    const sceneStarts = [...window.matchAll(/^\s{0,3}#{0,3}\s*第\s*\d+\s*场/gm)].map(match => match.index);
    let cut = sceneStarts.length ? floor + sceneStarts.at(-1)! : -1;
    if (cut < 0) {
      const boundary = Math.max(window.lastIndexOf('\n'), window.lastIndexOf('。'), window.lastIndexOf('！'), window.lastIndexOf('？'));
      cut = boundary < 0 ? limit : floor + boundary + 1;
    }
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) parts.push(rest);
  return parts;
}

export function storyboardPart(input: StoryboardGenerationInput, script: string) {
  const assets = (input.assets || [])
    .filter(asset => asset.name && script.includes(asset.name))
    .map(asset => ({kind: asset.kind, name: asset.name, description: asset.description.slice(0, 260)}));
  return JSON.stringify({
    script,
    ratio: input.ratio,
    videoType: input.videoType,
    style: input.style,
    shotSkill: input.shotSkill,
    assets,
  });
}
