import { lastFrameTime } from './frame-reference';

export async function captureVideoTailFrame(url: string, shotNumber: number) {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    await new Promise<void>((resolve, reject) => {
      const done = (error?: Error) => {
        clearTimeout(timer);
        video.removeEventListener('loadeddata', loaded);
        video.removeEventListener('error', failed);
        if (error) reject(error);
        else resolve();
      };
      const loaded = () => done();
      const failed = () => done(Error('上一分镜视频无法加载，请检查视频文件'));
      const timer = setTimeout(() => done(Error('读取上一分镜视频超时，请重试')), 15000);
      video.addEventListener('loadeddata', loaded);
      video.addEventListener('error', failed);
      video.src = url;
      video.load();
    });
    const time = lastFrameTime(video.duration);
    if (Math.abs(video.currentTime - time) >= 0.0001 || video.readyState < 2) {
      await new Promise<void>((resolve, reject) => {
        const done = (error?: Error) => {
          clearTimeout(timer);
          video.removeEventListener('seeked', seeked);
          video.removeEventListener('error', failed);
          if (error) reject(error);
          else resolve();
        };
        const seeked = () => done();
        const failed = () => done(Error('上一分镜视频解码失败'));
        const timer = setTimeout(() => done(Error('定位视频尾帧超时，请重试')), 12000);
        video.addEventListener('seeked', seeked);
        video.addEventListener('error', failed);
        try { video.currentTime = time; }
        catch { done(Error('无法定位上一分镜视频尾帧')); }
      });
    }
    if (!video.videoWidth || !video.videoHeight || video.readyState < 2)
      throw Error('上一分镜视频尚未解码，请稍后重试');
    const scale = Math.min(1, 4096 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) throw Error('浏览器不支持视频截帧');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(result => result ? resolve(result) : reject(Error('视频尾帧编码失败')), 'image/png'),
    );
    return {
      file: new File([blob], `shot-${shotNumber}-tail-frame.png`, { type: 'image/png' }),
      time: video.currentTime,
    };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}
