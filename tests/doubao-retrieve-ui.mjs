import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const cells = []; let index = 0;
const jsx = (type, props) => ({type, props});
const context = {exports: {}, require: name => name === 'react' ? {
  useState: initial => { const i = index++; if (!(i in cells)) cells[i] = initial; return [cells[i], value => { cells[i] = typeof value === 'function' ? value(cells[i]) : value; }]; },
  useRef: initial => { const i = index++; return cells[i] ?? (cells[i] = {current: initial}); },
} : name === 'react/jsx-runtime' ? {jsx, jsxs: jsx} : name === '@/lib/doubao-manager' ? {
  doubaoJobPaused: (job, paused) => paused && ['queued', 'prepared'].includes(job.status),
  doubaoJobFailed: job => ['failed', 'attention'].includes(job.status),
} : new Proxy({}, {get: (_, key) => key})};
vm.runInNewContext(ts.transpileModule(await fs.readFile('components/doubao-task-records.tsx', 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX}}).outputText, context);
function nodes(node) { if (!node) return []; if (Array.isArray(node)) return node.flatMap(nodes); if (typeof node !== 'object') return []; return [node, ...nodes(node.props?.children)]; }
const data = {paused: false, settings: {}, accounts: [], jobs: []};
const commands = []; let release;
const onCommand = (action, body) => { commands.push({action, body}); return new Promise(resolve => { release = resolve; }); };
const render = () => { index = 0; return context.exports.DoubaoTaskRecords({data, onCommand}); };
const buttons = tree => nodes(tree).filter(n => n.type === 'Button');
const retrieve = tree => buttons(tree).find(n => ['重新获取', '获取中…'].includes(n.props.children));
const job = {id: 'original', title: '测试分镜', projectId: 'project', shotId: 'shot', status: 'submitted', submittedAt: '2026-10-08T00:00:00Z'};
data.jobs = [job];
let tree = render(); assert(retrieve(tree), 'generating tasks must expose original-result retrieval');
const first = retrieve(tree); const promise = first.props.onClick(); first.props.onClick();
assert.equal(commands.length, 1, 'double click must not repeat retrieval');
assert.equal(commands[0].action, 'retrieve'); assert.equal(commands[0].body.id, job.id);
tree = render(); assert.equal(retrieve(tree).props.children, '获取中…'); assert.equal(retrieve(tree).props.disabled, true);
release(); await promise;
job.status = 'attention'; tree = render(); assert(retrieve(tree), 'review tasks must allow retrieval');
job.retrieval = {status: 'fetching'}; tree = render(); assert.equal(retrieve(tree).props.disabled, true, 'server state must preserve pending after reopening');
job.retrieval = {status: 'failed', message: '原任务仍在生成'}; tree = render();
assert.equal(retrieve(tree).props.disabled, false); assert(nodes(tree).some(n => n.type === 'output' && n.props.children === '获取失败：' + job.retrieval.message), 'failure reason must be visible in the task row');
for (const status of ['queued', 'prepared', 'failed', 'succeeded', 'cancelled']) { job.status = status; tree = render(); assert.equal(retrieve(tree), undefined, status + ' must not retrieve'); }
assert.equal(commands.some(c => ['enqueue', 'regenerate'].includes(c.action)), false);
console.log('PASS generating/review retrieval, same-job-only command, double click, reopen pending, failed reason and retry availability');
