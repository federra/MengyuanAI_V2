export function modelJSON(text: string): unknown {
  const cleaned = text
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw Error(
      '模型返回的JSON不完整或格式错误，原内容未修改。请减少单次内容后重试。',
    );
  }
}
