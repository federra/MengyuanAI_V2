import { id, type Project } from './studio';
export const creativeStages = ['创意', '故事', '剧本', '分镜', '剪辑'] as const;
export function parseStoryPlans(
  text: string,
): NonNullable<Project['storyPlans']> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
  } catch {
    throw Error('故事方案JSON格式错误，请重新生成');
  }
  const plans = (parsed as { plans?: unknown })?.plans;
  if (!Array.isArray(plans) || plans.length < 1 || plans.length > 4)
    throw Error('需要1至4个完整故事方案');
  return plans.map((p) => {
    if (
      !p ||
      typeof p.title !== 'string' ||
      !p.title.trim() ||
      p.title.length > 150 ||
      typeof p.summary !== 'string' ||
      p.summary.length > 1500 ||
      typeof p.content !== 'string' ||
      !p.content.trim() ||
      p.content.length > 30000 ||
      !Array.isArray(p.tags) ||
      p.tags.length > 6 ||
      p.tags.some((t: unknown) => typeof t !== 'string' || t.length > 30)
    )
      throw Error('模型返回的故事方案不完整，请重试');
    return {
      id: id(),
      title: p.title,
      summary: p.summary,
      content: p.content,
      tags: p.tags,
    };
  });
}
export function chooseStory(
  project: Project,
  planId: string,
): Partial<Project> {
  const plan = project.storyPlans?.find((p) => p.id === planId);
  if (!plan) throw Error('故事方案已不存在，请重新选择');
  return {
    story: plan.content,
    selectedStoryId: plan.id,
    shots: project.shots.map((s) => ({
      ...s,
      reviewRequired: '故事方案已变更，请复核剧本及镜头关联内容',
    })),
  };
}
