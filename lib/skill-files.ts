import { Unzip, UnzipInflate } from 'fflate';
import type { Skill } from './director';
import { zip } from './export';
import { inspectSkillFile } from './skill-quality';
export type SkillFileFormat = 'json' | 'txt' | 'md' | 'zip';
const encoder = new TextEncoder();
const textLimit = 100000;
export function exportSkillFile(skill: Skill, format: SkillFileFormat) {
  const { name, stage, version, content } = skill;
  const json = JSON.stringify({ name, stage, version, content }, null, 2);
  const markdown = `---\nname: ${JSON.stringify(name)}\nstage: ${JSON.stringify(stage)}\nversion: ${JSON.stringify(version)}\n---\n\n${content}`;
  const filename =
    Array.from(name, (char) =>
      char.charCodeAt(0) < 32 || /[\\/:*?"<>|]/.test(char) ? '_' : char,
    ).join('') || 'skill';
  const data =
    format === 'zip'
      ? zip([
          { name: 'SKILL.md', data: encoder.encode(markdown) },
        ])
      : format === 'json'
        ? json
        : markdown;
  return {
    name: `${filename}.${format}`,
    data,
    type:
      format === 'zip'
        ? 'application/zip'
        : format === 'json'
          ? 'application/json'
          : 'text/plain;charset=utf-8',
  };
}
export async function readSkillFile(
  file: File,
): Promise<{ source: string; filename: string }> {
  if (!/\.zip$/i.test(file.name)) {
    if (file.size > textLimit) throw Error('技能文件最多100KB');
    return { source: await file.text(), filename: file.name };
  }
  if (file.size > 5 * 1024 * 1024) throw Error('Skill ZIP最多5MB');
  const input = new Uint8Array(await file.arrayBuffer());
  if (input.length < 22 || input[0] !== 0x50 || input[1] !== 0x4b)
    throw Error('ZIP文件无效或已损坏');
  // Require the central-directory footer, so a truncated stream is not accepted.
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  let footer = -1;
  for (let i = input.length - 22; i >= Math.max(0, input.length - 65557); i--) {
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === input.length
    ) {
      footer = i;
      break;
    }
  }
  if (
    footer < 0 ||
    view.getUint16(footer + 4, true) !== 0 ||
    view.getUint16(footer + 6, true) !== 0 ||
    view.getUint32(footer + 16, true) + view.getUint32(footer + 12, true) !==
      footer
  )
    throw Error('ZIP文件不完整，或不支持分卷/ZIP64格式');
  const texts = new Map<string, string>();
  const names = new Set<string>();
  const ignored: string[] = [];
  let textBytes = 0,
    entries = 0;
  const unzip = new Unzip((entry) => {
    if (++entries > 100) throw Error('ZIP最多100个文件或目录');
    const name = entry.name.replaceAll('\\', '/');
    if (
      name.startsWith('/') ||
      /^[a-z]:/i.test(name) ||
      name.split('/').includes('..') ||
      name.includes('\0')
    )
      throw Error('ZIP包含不安全的文件路径');
    if (names.has(name)) throw Error('ZIP包含重复文件名');
    names.add(name);
    if (
      name.endsWith('/') ||
      name.startsWith('__MACOSX/') ||
      name.split('/').some((part) => part.startsWith('.'))
    )
      return;
    const readable = /\.(md|txt|json)$/i.test(name);
    if (!readable) {
      ignored.push(name);
      return;
    }
    if (entry.originalSize && entry.originalSize > textLimit)
      throw Error('ZIP文本合计最多100KB');
    const chunks: Uint8Array[] = [];
    entry.ondata = (error, chunk, final) => {
      if (error) throw Error('ZIP解压失败，请检查文件是否完整');
      textBytes += chunk.length;
      if (textBytes > textLimit) {
        entry.terminate();
        throw Error('ZIP文本合计最多100KB');
      }
      chunks.push(chunk);
      if (final) {
        const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
        let offset = 0;
        for (const c of chunks) {
          bytes.set(c, offset);
          offset += c.length;
        }
        texts.set(
          name,
          new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        );
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  try {
    // Bound each inflate step, including archives with forged size headers.
    for (let i = 0; i < input.length; i += 1024)
      unzip.push(input.subarray(i, i + 1024), i + 1024 >= input.length);
  } catch (error) {
    throw Error(
      error instanceof Error && /ZIP|路径|100KB/.test(error.message)
        ? error.message
        : 'ZIP文件无效或无法解压',
    );
  }
  const paths = [...texts.keys()];
  const mains = paths.filter((name) =>
    /(^|\/)(skill\.json|skill\.md)$/i.test(name),
  );
  const roots = new Set(
    mains.map((name) => name.slice(0, name.lastIndexOf('/') + 1)),
  );
  if (roots.size > 1) throw Error('ZIP包含多个Skill，请每次导入一个技能包');
  const main =
    mains.find((name) => /(^|\/)skill\.json$/i.test(name)) ||
    mains[0] ||
    (paths.length === 1 ? paths[0] : undefined);
  if (!main) throw Error('ZIP未找到唯一的SKILL.md或skill.json');
  const primarySkill = inspectSkillFile(texts.get(main)!).skill;
  const siblings = paths.filter((name) => {
    if (name === main) return false;
    // Our ZIP includes a human-readable copy. Skip it only if it is identical.
    const sameDirectory =
      name.slice(0, name.lastIndexOf('/') + 1) ===
      main.slice(0, main.lastIndexOf('/') + 1);
    return !(
      primarySkill &&
      sameDirectory &&
      /(^|\/)skill\.md$/i.test(name) &&
      JSON.stringify(inspectSkillFile(texts.get(name)!).skill) ===
        JSON.stringify(primarySkill)
    );
  });
  let source = texts.get(main)!;
  if (siblings.length || ignored.length) {
    source = `技能主文件：${main}\n${source}`;
    for (const name of siblings)
      source += `\n\n--- 随包参考文件：${name} ---\n${texts.get(name)}`;
    if (ignored.length)
      source += `\n\n未导入的非文本资源（平台仅支持文本Skill，不执行脚本）：${ignored.join('、')}`;
  }
  if (encoder.encode(source).length > textLimit)
    throw Error('ZIP展开后的技能文本最多100KB');
  return { source, filename: file.name };
}
