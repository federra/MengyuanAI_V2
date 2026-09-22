const fs = require('node:fs/promises');
const path = require('node:path');

function imageFolder(projectId, picturesDir, paths = path) {
  if (!/^[\w-]{1,80}$/.test(projectId || '')) throw Error('项目标识无效');
  return paths.resolve(picturesDir, 'AI短片导演', projectId);
}

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
  const folder = imageFolder(projectId, picturesDir);
  if (!folder.startsWith(base + path.sep)) throw Error('图片目录无效');
  const safeName = String(name || '图片').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 45);
  const filename = path.join(folder, `图片-${safeName}-${mediaId}.${ext}`);
  await fs.mkdir(folder, {recursive: true});
  try { await fs.writeFile(filename, Buffer.concat(chunks), {flag: 'wx'}); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  return filename;
}
async function chooseImage(input, config) {
  if (!/^[\w-]{1,80}$/.test(input?.projectId || '')) throw Error('项目标识无效');
  const folder = imageFolder(input.projectId, config.picturesDir);
  await fs.mkdir(folder, {recursive:true});
  if (input.mediaId) await exportImage(input, config);
  // Use the actual existing project directory on both platforms.
  const defaultPath = await fs.realpath(folder);
  const picked = await config.pick({title:'选择图片并应用',defaultPath,properties:['openFile'],filters:[{name:'图片',extensions:['png','jpg','jpeg','webp']}]});
  if (picked.canceled || !picked.filePaths[0]) return {canceled:true};
  await config.authorize();
  const file = await fs.open(picked.filePaths[0], 'r');
  let bytes;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || !stat.size || stat.size > 50 * 1024 * 1024) throw Error('请选择不超过50MB的图片文件');
    bytes = Buffer.alloc(stat.size);
    const {bytesRead} = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== bytes.length) throw Error('文件发生变化，请重新选择');
  } finally { await file.close(); }
  const type = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
    : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP' ? 'image/webp' : '';
  if (!type) throw Error('请选择有效的PNG、JPG或WebP图片');
  const form = new FormData();
  form.append('file', new Blob([bytes], {type}), path.basename(picked.filePaths[0]));
  const response = await (config.fetchImage || fetch)(`${config.origin}/api/media`, {method:'POST',headers:{Cookie:`director_session=${config.token}`,Origin:config.origin},body:form,redirect:'error'});
  if (!response.ok) throw Error('图片导入失败，请重试');
  return {media:await response.json()};
}
module.exports = {exportImage, chooseImage, imageFolder};
