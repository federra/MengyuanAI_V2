const fs = require('node:fs/promises');
const path = require('node:path');

async function exportImage({ projectId, mediaId, name }, { picturesDir, origin, token, fetchImage = fetch }) {
  if (!/^[\w-]{1,80}$/.test(projectId || '') || !/^[a-f0-9-]{36}$/.test(mediaId || ''))
    throw Error('图片或项目标识无效');
  const response = await fetchImage(`${origin}/api/media/${mediaId}`, {
    headers: { Cookie: `director_session=${token}` }, redirect: 'error',
  });
  if (!response.ok) throw Error('无法读取图片，请确认图片仍保存在当前桌面版。');
  const type = response.headers.get('content-type')?.split(';')[0];
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[type];
  if (!ext) throw Error('此素材不是支持的图片格式');
  const max = 50 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > max) throw Error('图片超过50MB');
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.length;
      if (size > max) { await reader.cancel(); throw Error('图片超过50MB'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const base = path.resolve(picturesDir, 'AI短片导演');
  const folder = path.resolve(base, projectId);
  if (!folder.startsWith(base + path.sep)) throw Error('图片目录无效');
  const safeName = String(name || '图片').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 45);
  const filename = path.join(folder, `图片-${safeName}-${mediaId}.${ext}`);
  await fs.mkdir(folder, {recursive: true});
  try { await fs.writeFile(filename, Buffer.concat(chunks), {flag: 'wx'}); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  return filename;
}
module.exports = {exportImage};
