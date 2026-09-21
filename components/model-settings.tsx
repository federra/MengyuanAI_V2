'use client';
import { readApiResponse, progressType } from '@/lib/api-response';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { modelDefaults, type ModelConfig } from '@/lib/models';
export async function modelApi<T>(
  url: string,
  body?: unknown,
  onAccepted?: (body: T) => void,
): Promise<T> {
  const r = await fetch(
    url,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: progressType },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  return readApiResponse<T>(r, undefined, onAccepted);
}
export function ModelSettings({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState(
    modelDefaults.map((m) => ({ ...m, id: m.kind })) as ModelConfig[],
  );
  const [kind, setKind] = useState<ModelConfig['kind']>('text');
  const [expanded, setExpanded] = useState<string | null>(null);
  const kindLabels = {text:'文本模型',image:'图片模型',video:'视频模型',audio:'音频模型'};
  const [newIds, setNewIds] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    modelApi<ModelConfig[]>('/api/models')
      .then(setRows)
      .then(() => setLoaded(true))
      .catch((e) => setMessage(e.message));
  }, []);
  function change(id: string, patch: Partial<ModelConfig>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  async function save(row: ModelConfig, action = 'save') {
    setBusy(row.id!);
    setMessage('');
    try {
      const out = await modelApi<ModelConfig & { message?: string }>(
        '/api/models',
        {
          ...row,
          speechVoices: row.speechVoices?.map((v) => v.trim()).filter(Boolean),
          apiKey: row.apiKey || '',
          action:
            action === 'save' && newIds.includes(row.id!) ? 'create' : action,
        },
      );
      if (action !== 'test') {
        setNewIds((ids) => ids.filter((id) => id !== row.id));
        if (action === 'default')
          setRows((rs) =>
            rs.map((r) => ({
              ...r,
              isDefault: r.kind === row.kind ? r.id === row.id : r.isDefault,
            })),
          );
        change(row.id!, { ...out, apiKey: '' });
        onChanged();
      }
      setMessage(
        out.message ||
          (action === 'default'
            ? '已设为默认模型。'
            : '已保存，可在生成时选择此配置。'),
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <section className="panel">
      <div className="panel-body">
        <h2>模型接入</h2>
        <p className="helper">
          每类可添加多个独立配置，并选择默认模型。填写服务商提供的 API
          基础地址和模型 ID；密钥加密保存在服务端，保存后不回显。
        </p>
        <output aria-live="polite">{message}</output>
        <div className="model-kind-tabs" role="tablist" aria-label="模型类别">
          {(['text','image','video','audio'] as const).map(type=><button key={type} type="button" role="tab" id={'model-tab-'+type} aria-selected={kind===type} aria-controls="model-kind-panel" onClick={()=>setKind(type)}>{kindLabels[type]} <small>{rows.filter(r=>r.kind===type).length}</small></button>)}
        </div>
        <div id="model-kind-panel" role="tabpanel" aria-labelledby={'model-tab-'+kind}>
        <div className="actions model-add-actions">
          {modelDefaults.filter(template=>template.kind===kind).map((template) => (
            <Button
              key={template.kind}
              variant="outline"
              disabled={!loaded || !!busy}
              onClick={() => {
                const id = crypto.randomUUID();
                setRows((rs) => [
                  ...rs,
                  { ...template, id, name: '自定义' + template.name },
                ]);
                setNewIds((ids) => [...ids, id]);
                setExpanded(id);
              }}
            >
              ＋ 添加
              {template.kind === 'text'
                ? '文本'
                : template.kind === 'image'
                  ? '图片'
                  : template.kind === 'audio'
                    ? '声音'
                    : '视频'}
              模型
            </Button>
          ))}
        </div>
        {loaded&&!rows.some(row=>row.kind===kind)&&<p className="helper">尚未添加此类配置，请点击上方按钮添加。</p>}
        {rows.filter(row=>row.kind===kind).map((row) => (
          <details className="model-config-disclosure" key={row.id} open={expanded===row.id}>
            <summary onClick={event=>{event.preventDefault();setExpanded(expanded===row.id?null:row.id!);}}>
              <span className="model-summary-name">{row.name}</span>
              <span className="model-summary-id" title={row.model}>{row.model || '未填写模型 ID'}</span>
              <span className="model-summary-status">{row.isDefault?'默认 · ':''}{row.enabled?'已启用':'未启用'}{newIds.includes(row.id!)?' · 待保存':''}</span>
              <span aria-hidden="true">{expanded===row.id?'收起 −':'配置 ＋'}</span>
            </summary>
          <fieldset
            disabled={!loaded || !!busy}
            className="model-config-card"
          >
            <legend>
              {row.kind === 'text'
                ? '推理模型 · 文本创作'
                : row.kind === 'image'
                  ? '图片模型'
                  : row.kind === 'audio'
                    ? '声音模型 · 台词配音'
                    : '视频模型'}
            </legend>
            <label className="field">
              <span>配置名称 {row.isDefault && '· 默认'}</span>
              <input
                value={row.name}
                onChange={(e) => change(row.id!, { name: e.target.value })}
              />
            </label>
            <label className="field" htmlFor={row.id + '-protocol'}>
              <span>接口协议</span>
              <Select
                value={row.protocol}
                onValueChange={(v) =>
                  v && change(row.id!, { protocol: v, voiceReference: 'auto' })
                }
              >
                <SelectTrigger id={row.id + '-protocol'}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(row.kind === 'text'
                    ? [['chat', 'Chat Completions 兼容']]
                    : row.kind === 'image'
                      ? [
                          ['seedream', 'Seedream / 火山方舟'],
                          ['images', 'Images Generations 兼容 · 文生图'],
                        ]
                      : row.kind === 'audio'
                        ? [['speech', 'Speech 兼容 · 同步音频流']]
                        : [
                            ['ark-video', 'Seedance / 火山方舟兼容'],
                            ['heima-video', '黑马 GROK · Videos 表单'],
                            ['heima-minimax', '黑马 MiniMax H3 · JSON'],
                            ['chat-video', '黑马 VEO · Chat 视频'],
                          ]
                  ).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {row.kind === 'video' && (
              <p className="helper">
                黑马基础地址：https://api.mmg.lat/v1。GROK 使用 Videos
                表单；Firefly VEO 使用 Chat
                视频。请按具体型号文档选择，不能只更改模型 ID。MiniMax H3
                选择专用 JSON 协议，型号 minimax_h3，支持480p/768p及5至15秒。
              </p>
            )}
            {row.kind === 'audio' && (
              <>
                <p className="helper">
                  自定义 Speech 兼容服务：以 Bearer API Key 鉴权，提交
                  model、input、voice、response_format、speed，返回 MP3 或 WAV
                  音频。其他协议需按服务商文档适配。
                </p>
                <label className="field">
                  <span>声音接口路径</span>
                  <input
                    value={row.speechPath || '/audio/speech'}
                    onChange={(e) =>
                      change(row.id!, { speechPath: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>默认音色 ID</span>
                  <input
                    value={row.speechVoice || ''}
                    placeholder="服务商提供的音色 ID"
                    onChange={(e) =>
                      change(row.id!, { speechVoice: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>可选音色 ID（每行一个）</span>
                  <textarea
                    value={(row.speechVoices || []).join('\n')}
                    onChange={(e) =>
                      change(row.id!, {
                        speechVoices: e.target.value.split('\n'),
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>输出格式</span>
                  <select
                    value={row.speechFormat || 'mp3'}
                    onChange={(e) =>
                      change(row.id!, {
                        speechFormat: e.target.value as 'mp3' | 'wav',
                      })
                    }
                  >
                    <option value="mp3">MP3</option>
                    <option value="wav">WAV</option>
                  </select>
                </label>
                <label className="actions">
                  <input
                    type="checkbox"
                    checked={!!row.speechInstructions}
                    onChange={(e) =>
                      change(row.id!, { speechInstructions: e.target.checked })
                    }
                  />
                  服务支持 instructions 表演指令（不支持请关闭）
                </label>
              </>
            )}
            <label className="field">
              <span>API 基础地址</span>
              <input
                type="url"
                value={row.baseUrl}
                onChange={(e) => change(row.id!, { baseUrl: e.target.value })}
              />
            </label>
            <label className="field">
              <span>模型 ID / 推理接入点 ID</span>
              <input
                value={row.model}
                placeholder="填写服务商控制台中的模型 ID"
                onChange={(e) => change(row.id!, { model: e.target.value })}
              />
            </label>
            <label className="field">
              <span>API Key {row.hasKey ? '· 已保存，留空保留' : ''}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={row.apiKey || ''}
                placeholder="粘贴服务商 API 密钥"
                onChange={(e) => change(row.id!, { apiKey: e.target.value })}
              />
            </label>
            {row.kind === 'video' && (
              <div className="field">
                <label htmlFor={row.id + '-voice'}>音色参考能力</label>
                <Select
                  value={row.voiceReference || 'auto'}
                  onValueChange={(v) =>
                    v &&
                    change(row.id!, {
                      voiceReference: v as ModelConfig['voiceReference'],
                    })
                  }
                >
                  <SelectTrigger id={row.id + '-voice'}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">
                      自动识别（未知型号省略）
                    </SelectItem>
                    <SelectItem value="none">
                      不支持，自动去掉音色参考
                    </SelectItem>
                    <SelectItem value="text">支持文字音色设定</SelectItem>
                    {['ark-video', 'heima-minimax'].includes(row.protocol) && (
                      <SelectItem value="audio">
                        支持音频样本（按所选接口提交）
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <small className="helper">
                  自定义接入点无法从 ID
                  判断能力时，可按服务商文档指定。仅支持文字时不会发送音频文件。
                </small>
              </div>
            )}
            {row.kind === 'text' && (
              <label className="field" htmlFor={row.id + '-thinking'}>
                <span>深度推理</span>
                <Select
                  value={row.thinking}
                  onValueChange={(v) => v && change(row.id!, { thinking: v })}
                >
                  <SelectTrigger id={row.id + '-thinking'}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">跟随模型默认（通用）</SelectItem>
                    <SelectItem value="enabled">
                      开启 thinking（需服务商支持）
                    </SelectItem>
                    <SelectItem value="disabled">
                      关闭 thinking（需服务商支持）
                    </SelectItem>
                  </SelectContent>
                </Select>
              </label>
            )}
            <label className="actions" htmlFor={row.id + '-enabled'}>
              <Checkbox
                id={row.id + '-enabled'}
                checked={row.enabled}
                onCheckedChange={(v) => change(row.id!, { enabled: !!v })}
              />
              启用此模型
            </label>
            <div className="actions">
              <Button onClick={() => save(row)}>
                {busy === row.id ? '处理中…' : '保存配置'}
              </Button>
              <Button
                variant="outline"
                disabled={!row.hasKey}
                onClick={() => save(row, 'test')}
              >
                检查已保存服务连接
              </Button>
              <Button
                variant="outline"
                disabled={
                  newIds.includes(row.id!) ||
                  !row.enabled ||
                  !row.hasKey ||
                  row.isDefault
                }
                onClick={() => save(row, 'default')}
              >
                {row.isDefault ? '默认模型' : '设为默认'}
              </Button>
              {newIds.includes(row.id!) && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setRows((rs) => rs.filter((r) => r.id !== row.id));
                    setNewIds((ids) => ids.filter((id) => id !== row.id));
                  }}
                >
                  取消新增
                </Button>
              )}
            </div>
          </fieldset>
          </details>
        ))}
        </div>
        <p className="helper">
          连接检查只查询服务，不生成素材；部分服务不开放模型列表，检查失败不一定代表生成接口不可用。实际生成会消耗服务商额度，模型支持的时长、画幅和参考图模式以服务商为准。
        </p>
        <div className="info-box">
          <strong>豆包 Chrome 插件 · 测试版</strong>
          <p>
            在分镜工作区点击“豆包插件”，下载并安装到 Google
            Chrome，使用自己的豆包账号登录。支持任务包导入、提示词填入、参考图下载与视频结果包回传。
          </p>
        </div>
      </div>
    </section>
  );
}
