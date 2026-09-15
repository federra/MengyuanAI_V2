// Inject in MAIN world, where the authenticated official API helper is installed.
export async function configureWatermark() {
  try {
    if (!globalThis.DirectorWatermark) throw Error('豆包助手尚未加载水印设置模块，请刷新创作页');
    await globalThis.DirectorWatermark.ensure();
    return {ok:true,steps:['已确认豆包官方设置：去除 AI 生成明水印（账号级）']};
  } catch (error) { return {ok:false,steps:[],error:error.message}; }
}
