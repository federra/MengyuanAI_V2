// Official account preference and official per-video export. Never rewrite CDN presets.
(function(root) {
  const request = root.fetch.bind(root);
  async function post(path, body) {
    if (!['https://www.doubao.com','https://doubao.com'].includes(location.origin)) throw Error('不是豆包页面');
    const response = await request(path, {method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw Error('豆包水印接口 HTTP '+response.status);
    const value = await response.json();
    if (value.code !== 0) throw Error('豆包水印设置或导出失败：'+(value.msg || value.code));
    return value.data;
  }
  async function ensure() {
    const read = async () => {
      const data = await post('/creativity/user_config/get', {});
      const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
      if (!object(data)) throw Error('豆包水印设置返回结构异常，未提交生成');
      if (data.config_map === undefined) return undefined;
      if (!object(data.config_map)) throw Error('豆包水印设置返回结构异常，未提交生成');
      const config = data.config_map['1'];
      if (config === undefined) return undefined;
      if (!object(config)) throw Error('豆包水印配置格式异常，未提交生成');
      const option = config.watermark_option;
      if (option === undefined) return undefined;
      if (!object(option)) throw Error('豆包水印选项格式异常，未提交生成');
      return option.is_on;
    };
    const before = await read();
    if (before === true) return {verified:true,changed:false};
    // The official creation UI treats an unset preference as initially off.
    // Initialize it through the official endpoint, never assume the write worked.
    if (before !== false && before !== undefined) throw Error('无法确认豆包 AI 水印设置，未提交生成');
    await post('/creativity/user_config/set', {config_type:1,config_value:{watermark_option:{is_on:true}}});
    if (await read() !== true) throw Error('豆包去除 AI 生成明水印设置未生效，未提交生成');
    return {verified:true,changed:true};
  }
  async function resolve(videoId, messageId) {
    if (!/^[-\w]{1,150}$/.test(videoId || '')) throw Error('视频编号无效');
    await ensure();
    const data = await post('/creativity/resource/get_without_watermark', {vid:[videoId]});
    if (data?.without_watermark !== true) throw Error('豆包未确认去除 AI 生成明水印，保留原任务');
    const video = data.download_video?.[videoId];
    if (!video || video.vid !== videoId || typeof video.download_url !== 'string') throw Error('官方导出结果与原视频不匹配');
    const url = new URL(video.download_url);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !['doubao.com','doubaocdn.com','byteimg.com','byteimg.cn','ibyteimg.com','bytecdn.cn','bytecdn.com','bytegecko.com','volces.com','volccdn.com','douyinvod.com','bytedance.net','ibytedtos.com'].some(h=>url.hostname===h||url.hostname.endsWith('.'+h))) throw Error('官方导出地址不是可信素材地址');
    const preset = url.searchParams.get('lr') || '';
    const brandWatermark = preset === 'video_gen_watermark_unpaid';
    if ((/watermark/i.test(preset) && preset !== 'video_gen_no_watermark' && !brandWatermark) || ['watermark','water_mark','wm'].some(k=>['1','true'].includes(url.searchParams.get(k)?.toLowerCase()))) throw Error('官方导出地址仍含 AI 水印标记');
    return {kind:'video',videoId,messageId,url:url.href,original:true,source:'doubao_without_watermark',aiWatermarkRemoved:true,brandWatermark};
  }
  root.DirectorWatermark = {ensure, resolve};
})(globalThis);
