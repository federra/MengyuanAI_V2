const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

async function exportVideo(
  { projectId, mediaId, name },
  { videosDir, origin, token, fetchVideo = fetch, journal },
) {
  if (
    !/^[\w-]{1,80}$/.test(projectId || '') ||
    !/^[a-f0-9-]{36}$/.test(mediaId || '')
  )
    throw Error('视频或项目标识无效');
  const response = await fetchVideo(`${origin}/api/media/${mediaId}`, {
    headers: { Cookie: `director_session=${token}` },
    redirect: 'error',
  });
  if (!response.ok) throw Error('无法读取视频，请确认视频仍保存在当前桌面版。');
  const type = response.headers.get('content-type')?.split(';')[0];
  const ext = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
  }[type];
  if (!ext || !response.body) throw Error('此素材不是支持的视频格式');
  const base = path.resolve(videosDir, 'AI短片导演');
  const folder = path.resolve(base, projectId);
  if (!folder.startsWith(base + path.sep)) throw Error('视频目录无效');
  const safeName = String(name || '视频')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .slice(0, 45);
  const filename = path.join(folder, `视频-${safeName}-${mediaId}.${ext}`);
  await fs.mkdir(folder, { recursive: true });
  try {
    const existing = await fs.lstat(filename);
    if (!existing.isFile()) throw Error('视频保存位置不是普通文件');
    await response.body.cancel();
    return { filename, created: false };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const temporary = path.join(folder, `.video-${randomUUID()}.part`);
  const file = await fs.open(temporary, 'wx');
  const reader = response.body.getReader();
  let size = 0;
  let pendingJournal = false;
  const operationId = randomUUID();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      await file.writeFile(chunk.value);
    }
    if (!size) throw Error('视频内容为空，请重新下载生成结果');
    await file.sync();
    await file.close();
    if (journal) {
      await journal.begin(
        {
          event_id: 'video_export:' + operationId,
          operation_id: operationId,
          output_id: mediaId,
          metric: 'video_export',
          video_kind: 'shot',
          quantity: 1,
          occurred_at: Date.now(),
          source: 'video_export',
        },
        { filename, temporary, size },
      );
      pendingJournal = true;
    }
    // Same-directory hard-link publication is atomic and never replaces an existing file.
    // Its temporary inode proves ownership if the process exits before event completion.
    let created = true;
    try {
      await fs.link(temporary, filename);
    } catch (error) {
      if (error.code === 'EEXIST') created = false;
      else {
        if (journal) {
          await journal.complete('video_export:' + operationId, false);
          pendingJournal = false;
        }
        throw error;
      }
    }
    if (journal) {
      await journal.complete('video_export:' + operationId, created);
      pendingJournal = false;
    }
    return { filename, created };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    await file.close().catch(() => {});
    if (!pendingJournal) await fs.unlink(temporary).catch(() => {});
  }
}
module.exports = { exportVideo };
