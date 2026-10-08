// Real model API/storage/request preparation; inert network and isolated SQLite accounts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'director-text-budget-'));
const dbs = [];
const originalFetch = globalThis.fetch;
const state = { db: null, env: { MODEL_ENCRYPTION_KEY: 'test-only-encryption-key' } };
globalThis.__textBudgetTest = state;
await fs.writeFile(path.join(dir, 'env.mjs'), 'export const env=globalThis.__textBudgetTest.env;');
async function compile(file, name) {
  const code = ts.transpileModule(await fs.readFile(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
    .replaceAll("'cloudflare:workers'", "'./env.mjs'")
    .replaceAll("'./server'", "'./server.mjs'")
    .replaceAll("'@/lib/server'", "'./server.mjs'")
    .replaceAll("'./models'", "'./models.mjs'")
    .replaceAll("'@/lib/models'", "'./models.mjs'")
    .replaceAll("'@/lib/model-server'", "'./model-server.mjs'");
  await fs.writeFile(path.join(dir, name + '.mjs'), code);
  return import(pathToFileURL(path.join(dir, name + '.mjs')).href);
}
const serverSource = (await fs.readFile('lib/server.ts', 'utf8')).replace('return env.DB;', 'return globalThis.__textBudgetTest.db;');
await fs.writeFile(path.join(dir, 'server.mjs'), ts.transpileModule(serverSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replaceAll("'cloudflare:workers'", "'./env.mjs'"));
const { modelDefaults, validateModel } = await compile('lib/models.ts', 'models');
const { seal, config, listConfigs, textRequest } = await compile('lib/model-server.ts', 'model-server');
const route = await compile('app/api/models/route.ts', 'route');
function connect(sqlite) {
  state.db = { prepare(sql) { let args = []; return { bind(...a) { args = a; return this; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; } }; } };
}
async function account() {
  const sqlite = new DatabaseSync(':memory:'); dbs.push(sqlite);
  for (const file of (await fs.readdir('drizzle')).filter(f => f.endsWith('.sql')).sort()) sqlite.exec(await fs.readFile('drizzle/' + file, 'utf8'));
  connect(sqlite); return sqlite;
}
const template = { ...modelDefaults[0], name: '测试文本', model: 'deepseek-flash', baseUrl: 'https://api.example.com/v1', enabled: true };
async function post(body, origin = 'https://studio.example') {
  const r = await route.POST(new Request('https://studio.example/api/models', { method: 'POST', headers: { origin }, body: JSON.stringify(body) }));
  return { status: r.status, data: await r.json() };
}
function capture(result = { choices: [{ finish_reason: 'stop', message: { content: '正文' } }] }) {
  const calls = []; globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return Response.json(result); }; return calls;
}
void test('old and fresh text profiles default to unlimited while custom budgets persist per profile/account', async () => {
  const first = await account();
  first.prepare('INSERT INTO model_configs(kind,body,secret) VALUES(?,?,?)').run('text', JSON.stringify(template), await seal('legacy-test-key'));
  assert.equal((await config('text')).maxOutputTokens, null, 'legacy omission becomes unlimited on read');
  assert.equal((await listConfigs()).find(c => c.id === 'text').maxOutputTokens, null);
  const legacyProfile = crypto.randomUUID();
  first.prepare('INSERT INTO model_profiles(id,kind,body,secret) VALUES(?,?,?,?)').run(legacyProfile, 'text', JSON.stringify(template), await seal('legacy-profile-test-key'));
  assert.equal((await config('text', false, legacyProfile)).maxOutputTokens, null);
  assert.equal((await listConfigs()).find(c => c.id === legacyProfile).maxOutputTokens, null);
  const calls = capture(); await textRequest({ messages: [], max_tokens: 8000, max_completion_tokens: 12000 });
  assert(!('max_tokens' in calls[0].body)); assert(!('max_completion_tokens' in calls[0].body));
  const freshId = crypto.randomUUID();
  assert.equal((await post({ ...template, id: freshId, action: 'create', apiKey: 'fresh-test-key' })).status, 200);
  assert.equal(JSON.parse(first.prepare('SELECT body FROM model_profiles WHERE id=?').get(freshId).body).maxOutputTokens, null);
  const id = crypto.randomUUID();
  assert.equal((await post({ ...template, id, action: 'create', maxOutputTokens: 12345, apiKey: 'profile-test-key' })).status, 200);
  assert.equal((await config('text', true, id)).maxOutputTokens, 12345);
  assert.equal(JSON.parse(first.prepare('SELECT body FROM model_profiles WHERE id=?').get(id).body).maxOutputTokens, 12345);
  assert.equal((await post({ ...template, id, action: 'default', maxOutputTokens: 12345, apiKey: '' })).status, 200);
  const custom = capture(); await textRequest({ messages: [], max_tokens: 24000, max_completion_tokens: 65536, reasoning_effort: 'max' });
  assert.equal(custom[0].body.max_tokens, 12345); assert(!('max_completion_tokens' in custom[0].body));
  assert.equal((await listConfigs()).find(c => c.id === id).maxOutputTokens, 12345);
  assert.equal((await post({ ...template, id, maxOutputTokens: null, apiKey: '' })).status, 200);
  const unlimited = capture(); await textRequest({ messages: [], max_tokens: 5000 }); assert(!('max_tokens' in unlimited[0].body));
  assert.equal((await config('text', true, id)).apiKey, 'profile-test-key', 'changing budget retains encrypted key');
  assert.equal((await post({ ...template, id, maxOutputTokens: 4321, apiKey: '' })).status, 200);
  const second = await account();
  assert.equal((await config('text')).maxOutputTokens, null);
  await assert.rejects(config('text', false, id), /找不到/);
  assert.equal((await post({ ...template, maxOutputTokens: 777, apiKey: 'account-two-test-key' })).status, 200);
  assert.equal((await config('text')).maxOutputTokens, 777);
  connect(first); assert.equal((await config('text')).maxOutputTokens, 4321);
  connect(second); assert.equal((await config('text')).maxOutputTokens, 777);
});
void test('invalid limits are rejected before storage and cross-origin writes preserve saved budgets', async () => {
  const sqlite = await account();
  assert.equal((await post({ ...template, maxOutputTokens: 120, apiKey: 'validation-test-key' })).status, 200);
  for (const value of [0, -1, 1.5, '8000', 'unlimited', '', false, {}, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateModel({ ...template, maxOutputTokens: value }), /正整数/);
    const out = await post({ ...template, maxOutputTokens: value, apiKey: '' }); assert.equal(out.status, 400);
  }
  assert.equal((await post({ ...template, maxOutputTokens: 999, apiKey: '' }, 'https://evil.example')).status, 400);
  assert.equal(JSON.parse(sqlite.prepare('SELECT body FROM model_configs WHERE kind=?').get('text').body).maxOutputTokens, 120);
  assert.equal(validateModel({ ...template, maxOutputTokens: 1 }).maxOutputTokens, 1);
  assert.equal(validateModel({ ...modelDefaults[1], model: 'image-model', maxOutputTokens: 999 }).maxOutputTokens, undefined);
});
void test('unlimited never adds a cap for any thinking mode and custom cap never gets DeepSeek compensation', async () => {
  const sqlite = await account(); const secret = await seal('request-test-key');
  for (const model of ['deepseek-flash', 'deepseek-v4-pro', 'deepseek-v4-flash', 'unknown-text']) for (const thinking of ['auto', 'enabled', 'disabled']) for (const maxOutputTokens of [null, 321]) {
    sqlite.prepare('INSERT INTO model_configs(kind,body,secret) VALUES(?,?,?) ON CONFLICT(kind) DO UPDATE SET body=excluded.body,secret=excluded.secret').run('text', JSON.stringify({ ...template, model, thinking, maxOutputTokens }), secret);
    const calls = capture(); await textRequest({ messages: [], max_tokens: 8000, max_completion_tokens: 100000, reasoning_effort: 'max' });
    assert.equal(calls.length, 1); assert.equal(calls[0].body.max_tokens, maxOutputTokens === null ? undefined : 321); assert(!('max_completion_tokens' in calls[0].body));
  }
});
void test('empty truncation diagnoses the configured cap or provider default without exposing reasoning', async () => {
  const sqlite = await account(); const secret = await seal('truncation-test-key');
  for (const maxOutputTokens of [null, 876]) {
    sqlite.prepare('INSERT INTO model_configs(kind,body,secret) VALUES(?,?,?) ON CONFLICT(kind) DO UPDATE SET body=excluded.body,secret=excluded.secret').run('text', JSON.stringify({ ...template, maxOutputTokens }), secret);
    const calls = capture({ choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: 'secret reasoning' } }] });
    await assert.rejects(textRequest({ max_tokens: 8000 }), e => { assert.match(e.message, maxOutputTokens === null ? /由服务商决定/ : /876 tokens/); assert(!e.message.includes('secret reasoning')); return true; });
    assert.equal(calls.length, 1);
  }
});
void test('every text generation entry point uses the saved budget on the actual outbound request', async () => {
  // All local processing stays real; only fetch is replaced at the external provider boundary.
  for (const name of ['studio', 'creative', 'dialogue', 'dialogue-timeline', 'assets', 'director', 'director-stage', 'storyboard-episodes', 'storyboard-contract', 'storyboard-normalize', 'storyboard-generation-input', 'storyboard-conversion-server', 'video-duration', 'skill-quality', 'model-json', 'api-response', 'usage-server']) {
    const source = await fs.readFile('lib/' + name + '.ts', 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
      .replaceAll("'cloudflare:workers'", "'./env.mjs'")
      .replace(/(['"])(?:@\/lib\/|\.\/)([\w-]+)\1/g, "'./$2.mjs'");
    await fs.writeFile(path.join(dir, name + '.mjs'), code);
  }
  await fs.copyFile('lib/builtin-adapted-skills.json', path.join(dir, 'builtin-adapted-skills.json'));
  const handlers = {};
  for (const name of ['ai', 'assets', 'director', 'skills/import']) {
    const code = ts.transpileModule(await fs.readFile('app/api/' + name + '/route.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
      .replace(/(['"])(?:@\/lib\/|\.\/)([\w-]+)\1/g, "'./$2.mjs'");
    const target = path.join(dir, name.replace('/', '-') + '-route.mjs');
    await fs.writeFile(target, code); handlers[name] = await import(pathToFileURL(target).href);
  }
  const { exampleProject } = await import(pathToFileURL(path.join(dir, 'studio.mjs')).href);
  const { prepareStoryboard } = await import(pathToFileURL(path.join(dir, 'storyboard-conversion-server.mjs')).href);
  const sqlite = await account(); const secret = await seal('all-entrypoints-test-key');
  const storyboard = { shots: [{ title: '街头', duration: 5, description: '小猫走过街道', prompt: '小猫走过街道', lines: [], assetNames: [] }], assets: [] };
  const invoke = async (name, body) => {
    const response = await handlers[name].POST(new Request('https://studio.example/api/' + name, { method: 'POST', headers: { origin: 'https://studio.example', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    assert.equal(response.status, 200, name + ': ' + await response.text());
  };
  const cases = [
    ...['story', 'script', 'scenes', 'prompt', 'assetDesign'].map(task => ({ name: task, answer: '完整测试正文', run: () => invoke('ai', { task, content: '小猫走过街道。', storyLength: '5000字以上' }) })),
    { name: 'storyOptions', answer: { plans: [{ title: '故事', summary: '概要', content: '完整故事正文', tags: [] }] }, run: () => invoke('ai', { task: 'storyOptions', content: '小猫找朋友', storyCount: 1, storyLength: '5000字以上' }) },
    { name: 'storyboards', answer: storyboard, run: () => invoke('ai', { task: 'shots', content: JSON.stringify({ script: '小猫走过街道。', ratio: '16:9', style: '电影' }) }) },
    { name: 'assets', answer: { assets: [] }, run: () => invoke('assets', { script: '小猫走过街道。' }) },
    { name: 'director', answer: { reply: '已检查', changes: [] }, run: () => invoke('director', { project: exampleProject(), stage: '故事', instruction: '检查故事因果' }) },
    { name: 'skill adaptation', answer: { skill: { name: '分镜设计', version: '1.0', stage: '分镜', content: '根据当前剧本设计镜头，保持人物、场景和道具连续，返回分镜建议。' }, changes: ['外部依赖改为用户提供素材。'] }, run: () => invoke('skills/import', { source: '# 外部技能\n运行 scripts/create.py', filename: 'skill.md' }) },
    { name: 'storyboard conversion', answer: storyboard, run: () => prepareStoryboard('街头五秒分镜，小猫走过街道。') },
  ];
  for (const maxOutputTokens of [null, 991]) {
    sqlite.prepare('INSERT INTO model_configs(kind,body,secret) VALUES(?,?,?) ON CONFLICT(kind) DO UPDATE SET body=excluded.body,secret=excluded.secret').run('text', JSON.stringify({ ...template, maxOutputTokens }), secret);
    for (const entry of cases) {
      const calls = capture({ choices: [{ finish_reason: 'stop', message: { content: typeof entry.answer === 'string' ? entry.answer : JSON.stringify(entry.answer) } }] });
      await entry.run(); assert.equal(calls.length, 1, entry.name);
      assert.equal(calls[0].body.max_tokens, maxOutputTokens === null ? undefined : 991, entry.name);
      assert(!('max_completion_tokens' in calls[0].body), entry.name);
      assert.equal(calls[0].body.model, 'deepseek-flash');
    }
  }
});
test.after(async () => { globalThis.fetch = originalFetch; for (const db of dbs) db.close(); delete globalThis.__textBudgetTest; await fs.rm(dir, { recursive: true, force: true }); });
