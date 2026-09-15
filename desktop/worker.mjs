import application from './index.js';
export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    const cookie = request.headers.get('cookie') || '';
    const authenticated = cookie.split(';').some(part => part.trim() === `director_session=${env.DESKTOP_SESSION_TOKEN}`);
    if (url.hostname !== '127.0.0.1' || !authenticated)
      return new Response('此接口仅供桌面应用使用。', {status:403});
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return new Response('跨站请求已拒绝。',{status:403});
    if (url.pathname === '/__desktop/health') return Response.json({ready:true,mode:'local-desktop'});
    if (request.method === 'GET' || request.method === 'HEAD') {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
    }
    return application.fetch(request,env,context);
  },
};
