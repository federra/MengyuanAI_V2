import application from './index.js';
export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return new Response('Invalid path',{status:400});}
    const cookie = request.headers.get('cookie') || '';
    const authenticated = cookie.split(';').some(part => part.trim() === `director_session=${env.DESKTOP_SESSION_TOKEN}`);
    if (url.hostname !== '127.0.0.1' || !authenticated)
      return new Response('此接口仅供桌面应用使用。', {status:403});
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return new Response('跨站请求已拒绝。',{status:403});
    if (url.pathname === '/__desktop/health') return Response.json({ready:true,mode:'local-desktop'});
    let guarded=false;
    if (pathname.startsWith('/api/') || pathname==='/api' || pathname === '/_next/image') {
      // A separate main-process-only credential permits already submitted Doubao
      // results to finish saving. It is never exposed through preload or cookies.
      let finishing = env.DESKTOP_INTERNAL_TOKEN && request.headers.get('x-director-finish') === env.DESKTOP_INTERNAL_TOKEN && url.pathname === '/api/media' && request.method === 'POST';
      if(env.DESKTOP_INTERNAL_TOKEN&&request.headers.get('x-director-finish')===env.DESKTOP_INTERNAL_TOKEN&&pathname==='/api/generations'&&request.method==='POST'){
        const input=await request.clone().json().catch(()=>null);
        finishing=input?.action==='refresh'&&typeof input.id==='string'&&!!await env.DB.prepare("SELECT id FROM generation_jobs WHERE id=? AND status='running' AND remote_id IS NOT NULL AND remote_id!=''").bind(input.id).first();
      }
      if (!finishing) {
        const response = await env.DESKTOP_AUTH.fetch('http://authorization/check');
        const state = await response.json();
        if (!state.authorized || !env.DESKTOP_OWNER_ID || state.user?.id !== env.DESKTOP_OWNER_ID)
          return Response.json({error:state.code || 'UNAUTHENTICATED'},{status:401,headers:{'Cache-Control':'no-store'}});
        guarded=true;
      }
    }
    try {
    if (request.method === 'GET' || request.method === 'HEAD') {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
    }
    const response=await application.fetch(request,env,context);
    if(guarded && request.method==='POST' && ['/api/ai','/api/director'].includes(pathname)){
      const completed=response.clone();
      // Drain a separate branch so an unmounted login screen cannot discard an
      // already submitted text result. Store locally under this account only.
      context.waitUntil((async()=>{
        const body=await completed.text();
        if(body.length<=2_800_000)await env.DESKTOP_AUTH.fetch('http://authorization/completed',{method:'POST',body:JSON.stringify({path:pathname,projectId:request.headers.get('x-director-project')||'',receivedAt:new Date().toISOString(),status:completed.status,body})});
      })());
    }
    if(guarded&&response.body){
      guarded=false;
      const reader=response.body.getReader();let finished=false;
      const finish=async()=>{if(!finished){finished=true;await env.DESKTOP_AUTH.fetch('http://authorization/finish');}};
      const body=new ReadableStream({
        async pull(controller){try{const chunk=await reader.read();if(chunk.done){controller.close();await finish();}else controller.enqueue(chunk.value);}catch(error){controller.error(error);await finish();}},
        async cancel(reason){try{await reader.cancel(reason);}finally{await finish();}},
      });
      const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');
      return new Response(body,{status:response.status,statusText:response.statusText,headers});
    }
    return response;
    } finally {if(guarded)await env.DESKTOP_AUTH.fetch('http://authorization/finish');}
  },
};
