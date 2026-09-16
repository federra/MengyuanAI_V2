import type { Skill } from './director';
export const skillStages = [
  '全项目',
  '创意',
  '故事',
  '剧本',
  '分场',
  '分镜',
  '资产',
  '生图',
  '视频',
  '配音',
  '剪辑',
];
export type SkillQuality = { issues: string[]; skill?: Omit<Skill, 'id'> };
export function inspectSkill(value: unknown): SkillQuality {
  const issues: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {
      issues: ['文件不是平台技能对象，需要提取技能名称、版本、阶段和指令。'],
    };
  const x = value as Record<string, unknown>;
  for (const [field, label, max] of [
    ['name', '名称', 150],
    ['version', '版本', 50],
    ['content', '技能指令', 20000],
  ] as const)
    if (
      typeof x[field] !== 'string' ||
      !x[field].trim() ||
      x[field].length > max
    )
      issues.push(`${label}应为1至${max}字文本。`);
  if (typeof x.stage !== 'string' || !skillStages.includes(x.stage))
    issues.push('适用阶段未匹配平台创作流程。');
  if (
    ['tools', 'dependencies', 'scripts', 'resources', 'allowed-tools'].some(
      (key) =>
        x[key] != null &&
        JSON.stringify(x[key]) !== '[]' &&
        JSON.stringify(x[key]) !== '{}' &&
        x[key] !== '',
    )
  )
    issues.push('包含平台不支持的工具或资源声明，需要提取为独立创作指令。');
  if (typeof x.content === 'string') {
    if (
      /```\s*(?:bash|sh|shell|python|javascript|typescript|powershell|cmd)\b|(?:^|\n)\s*(?:npm |pip |python |node |curl |git clone)/im.test(
        x.content,
      )
    )
      issues.push('包含代码或命令执行步骤，平台Skill仅支持文本创作指令。');
    if (
      /(?:scripts|references|resources)\/[\w./-]+|[A-Z]:\\|(?:必须|需要|调用|执行|运行|使用)\s*(?:MCP|mcp__|tools\.|ComfyUI|浏览器自动化|本地文件|API接口|终端)/i.test(
        x.content,
      )
    )
      issues.push(
        '依赖外部工具或未随文件提供的资源，需要改为平台内可执行的创作步骤。',
      );
    if (
      /\b(?:run|execute|invoke|install|call)\s+(?:the\s+)?(?:script|command|shell|terminal|MCP|tool|API|npm|pip|python|node)\b/i.test(
        x.content,
      )
    )
      issues.push('包含外部执行要求，需要转换为平台支持的文本创作流程。');
    if (
      /(?:ignore|override)\s+(?:all\s+)?(?:previous|system)\s+instructions|忽略(?:之前|所有|系统).*指令/i.test(
        x.content,
      )
    )
      issues.push('包含改变系统权限或指令优先级的内容，需要移除。');
  }
  return {
    issues,
    ...(!issues.length
      ? {
          skill: {
            name: (x.name as string).trim(),
            version: (x.version as string).trim(),
            stage: x.stage as string,
            content: (x.content as string).trim(),
          },
        }
      : {}),
  };
}
export function inspectSkillFile(source: string): SkillQuality {
  const text = source
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^```json\s*\n([\s\S]*?)\n```$/i, '$1');
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (frontmatter) {
    const metadata: Record<string, unknown> = {};
    for (const line of frontmatter[1].split(/\r?\n/)) {
      const entry = /^([a-zA-Z][\w-]*):\s*(.*)$/.exec(line);
      if (!entry) continue;
      if (
        !entry[2].trim() &&
        [
          'tools',
          'dependencies',
          'scripts',
          'resources',
          'allowed-tools',
        ].includes(entry[1])
      ) {
        metadata[entry[1]] = '声明外部依赖';
        continue;
      }
      try {
        metadata[entry[1]] = JSON.parse(entry[2]);
      } catch {
        metadata[entry[1]] = entry[2].replace(/^['"]|['"]$/g, '');
      }
    }
    return inspectSkill({ ...metadata, content: frontmatter[2].trim() });
  }
  try {
    return inspectSkill(JSON.parse(text));
  } catch {
    return {
      issues: [
        '文件为正文、其他Skill格式或非标准JSON，需要提取元数据并匹配适用阶段。',
      ],
    };
  }
}
