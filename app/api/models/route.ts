import { db, json, sameOrigin } from '@/lib/server';
import { config, listConfigs, seal, modelRequest } from '@/lib/model-server';
import { validateModel, type ModelConfig } from '@/lib/models';
export async function GET() {
  try {
    return json(await listConfigs());
  } catch {
    return json({ error: '模型配置读取失败' }, 503);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const raw = await req.text();
    if (raw.length > 12000) throw Error('配置过大');
    const body = JSON.parse(raw);
    const c = validateModel(body);
    const id = body.id || c.kind;
    if (
      typeof id !== 'string' ||
      !/^[\w-]{1,80}$/.test(id) ||
      (['text', 'image', 'video', 'audio'].includes(id) && id !== c.kind)
    )
      throw Error('模型配置 ID 无效');
    let old: ModelConfig;
    if (body.action === 'create') {
      if (!/^[a-f0-9-]{36}$/.test(id)) throw Error('新增配置 ID 无效');
      const existing = await db()
        .prepare('SELECT id FROM model_profiles WHERE id=?')
        .bind(id)
        .first();
      if (existing) throw Error('该配置已存在，请刷新后编辑');
      old = { ...c, hasKey: false };
    } else old = await config(c.kind, true, id);
    if (body.action === 'default') {
      if (!old.enabled || !old.hasKey) throw Error('请先保存并启用该模型');
      await db()
        .prepare(
          'INSERT INTO model_defaults(kind,profile_id) VALUES(?,?) ON CONFLICT(kind) DO UPDATE SET profile_id=excluded.profile_id',
        )
        .bind(c.kind, id)
        .run();
      return json({ ...old, apiKey: undefined, isDefault: true });
    }
    if (body.action === 'test') {
      if (!old.apiKey) throw Error('请先保存密钥');
      const response = await modelRequest(
        old,
        old.protocol === 'ark-video'
          ? '/contents/generations/tasks?page_size=1'
          : '/models',
      );
      if (old.protocol !== 'ark-video') {
        const data = (await response.json()) as { data?: { id?: string }[] };
        if (!Array.isArray(data.data))
          throw Error('服务响应不是兼容的模型列表，无法据此判断连接成功');
        const found = data.data.some((m) => m.id === old.model);
        return json({
          message: found
            ? `服务连接正常，模型列表包含 ${old.model}。具体生成能力仍需实测。`
            : `服务连接正常，但模型列表未包含 ${old.model}，请核对模型 ID 和令牌权限。`,
        });
      }
      return json({
        message: '服务鉴权检查通过；具体模型生成权限需通过实际生成验证。',
      });
    }
    if (
      typeof body.apiKey !== 'string' ||
      body.apiKey.length > 4096 ||
      /[\r\n]/.test(body.apiKey)
    )
      throw Error('密钥格式无效');
    if (!body.apiKey.trim() && old.baseUrl !== c.baseUrl && old.hasKey)
      throw Error('修改 API 地址时请重新填写密钥，避免将旧密钥发往其他服务');
    const key = body.apiKey.trim() || old.apiKey || '';
    if (c.enabled && !key) throw Error('启用前请填写 API 密钥');
    const encrypted = key ? await seal(key) : '';
    if (id === c.kind)
      await db()
        .prepare(
          'INSERT INTO model_configs(kind,body,secret) VALUES(?,?,?) ON CONFLICT(kind) DO UPDATE SET body=excluded.body,secret=excluded.secret',
        )
        .bind(c.kind, JSON.stringify(c), encrypted)
        .run();
    else if (body.action === 'create')
      await db()
        .prepare(
          'INSERT INTO model_profiles(id,kind,body,secret) VALUES(?,?,?,?)',
        )
        .bind(id, c.kind, JSON.stringify(c), encrypted)
        .run();
    else
      await db()
        .prepare(
          'UPDATE model_profiles SET body=?,secret=? WHERE id=? AND kind=?',
        )
        .bind(JSON.stringify(c), encrypted, id, c.kind)
        .run();
    return json({ ...c, id, hasKey: !!key });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : '保存失败' }, 400);
  }
}
