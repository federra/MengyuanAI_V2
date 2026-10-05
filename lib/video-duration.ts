import type { ModelConfig } from './models';

// Match the duration constraints already enforced by our video adapters.
export function videoDurationOptions(model?: Pick<ModelConfig, 'protocol' | 'model'>, channel?: string): number[] {
  if (channel !== 'doubao') {
    if (model?.protocol === 'heima-video') return [6, 10, 15];
    if (model?.protocol === 'chat-video' && model.model.startsWith('firefly-veo31-')) {
      const seconds = Number(model.model.match(/-(\d+)s-\d+x\d+-\d+p$/)?.[1]);
      if (Number.isInteger(seconds) && seconds >= 2 && seconds <= 15) return [seconds];
    }
  }
  const min = channel === 'doubao' ? 4 : model?.protocol === 'heima-minimax' ? 5 : 2;
  return Array.from({ length: 16 - min }, (_, i) => i + min);
}

export function videoDurationError(duration: number, model?: Pick<ModelConfig, 'protocol' | 'model'>, channel?: string): string {
  const options = videoDurationOptions(model, channel);
  if (options.includes(duration)) return '';
  const range = options.length > 3 ? `${options[0]}～${options.at(-1)}整数秒` : `${options.join('、')}秒`;
  return `当前渠道支持${range}，此分镜为${duration}秒。请按支持时长重新拆分动作和对白后再生成视频。`;
}
