const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

async function exportVideo({ projectId, mediaId, name }, { videosDir, origin, token, fetchVideo = fetch }) {
  if (!/^[\w-]{1,80}$/.test(projectId || '') || !/^[a-f0-9-]{36}$/.test(mediaId || ''))
    throw Error('视频或项目标识无效');
  const response = await fetchVideo(`${origin}/api/media/${mediaId}`, {
    headers: { Cookie: `director_session=${token}` }, redirect: 'error',
  });
  if (!response.ok) throw Error('无法读取视频，请确认视频仍保存在当前桌面版。');
  const type = response.headers.get('content-type')?.split(';')[0];
  const ext = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' }[type];
  if (!ext || !response.body) throw Error('此素材不是支持的视频格式');
  const base = path.resolve(videosDir, 'AI短片导演');
  const folder = path.resolve(base, projectId);
  if (!folder.startsWith(base + path.sep)) throw Error('视频目录无效');
  const safeName = String(name || '视频').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 45);
  const filename = path.join(folder, `视频-${safeName}-${mediaId}.${ext}`);
  await fs.mkdir(folder, { recursive: true });
  try {
    const existing = await fs.lstat(filename);
    if (!existing.isFile()) throw Error('视频保存位置不是普通文件');
    await response.body.cancel();
    return filename;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = path.join(folder, `.video-${randomUUID()}.part`);
  const file = await fs.open(temporary, 'wx');
  const reader = response.body.getReader();
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      await file.writeFile(chunk.value);
    }
    if (!size) throw Error('视频内容为空，请重新下载生成结果');
    await file.close();
    // Publish only a fully downloaded file, preserving any existing user copy.
    try { await fs.copyFile(temporary, filename, constants.COPYFILE_EXCL); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    return filename;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    await file.close().catch(() => {});
    await fs.unlink(temporary).catch(() => {});
  }
}
module.exports = { exportVideo };
