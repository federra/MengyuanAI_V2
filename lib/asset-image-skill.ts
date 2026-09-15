import { builtinSkills } from './director';
import type { Asset, Project } from './studio';

export function assetImageSkills(project: Project) {
  return [...builtinSkills, ...(project.skills || [])].filter((s) =>
    ['生图', '资产', '全项目'].includes(s.stage),
  );
}

export function assetImageSkill(project: Project, asset: Asset) {
  const selected =
    asset.imageSkillId || project.assetImageSkillIds?.[asset.kind] || 'none';
  if (selected === 'none') return undefined;
  const skill = assetImageSkills(project).find((s) => s.id === selected);
  if (!skill)
    throw Error(`${asset.name}所选的生图 Skill 已删除或不适用，请重新选择。`);
  return skill;
}

export function assetImagePrompt(project: Project, asset: Asset) {
  const skill = assetImageSkill(project, asset);
  const label = asset.kind === '人物' ? '角色' : asset.kind;
  const prompt = [
    `生成${label}设定图片。画幅：${project.ratio}。统一风格：${project.style}。`,
    `${label}名称：${asset.name}\n${label}描述：${asset.description}`,
    asset.attributes?.三视图 === '是'
      ? '展示同一角色正面、侧面、背面三视图，服饰、比例、光照保持一致。'
      : '',
    skill
      ? `本次生图 Skill：${skill.name}（${skill.version}）\n${skill.content}\n请将上述规则用于本次图片生成，保持提供的角色身份与外观，最终交付图片。`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  if (prompt.length > 10000)
    throw Error(
      `${asset.name}的描述与 Skill 合计超过10000字，请精简描述或技能后再提交。`,
    );
  return prompt;
}
