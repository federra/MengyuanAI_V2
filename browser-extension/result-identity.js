// Execute in MAIN world: React's message metadata is invisible to content-script worlds.
// Only inspect the completed message already matched by probeResult.
export function readResultIdentity(job, result) {
  if (!job?.requestId || !result?.messageId || job.conversationUrl !== location.href || result.url !== location.href || !['https://www.doubao.com','https://doubao.com'].includes(location.origin)) return null;
  const ids = new Set();
  const roots = [...document.querySelectorAll('[data-message-id]')].filter(e => e.getAttribute('data-message-id') === result.messageId && e.getClientRects().length && !e.closest('[hidden],[aria-hidden="true"]'));
  for (const root of roots) for (const node of [root, ...root.querySelectorAll('*')].slice(0, 600)) {
    const key = Object.keys(node).find(k => k.startsWith('__reactFiber'));
    let fiber = key && node[key];
    for (let depth = 0; fiber && depth < 12; depth++, fiber = fiber.return) {
      const video = fiber.memoizedProps?.video;
      if (video?.messageId === result.messageId && typeof video.vid === 'string' && /^[-\w]{1,150}$/.test(video.vid)) ids.add(video.vid);
      const message = fiber.memoizedProps?.message;
      if (message?.message_id && message.message_id !== result.messageId) break;
    }
  }
  return ids.size === 1 ? {videoId: [...ids][0], messageId: result.messageId} : null;
}
