'use client';
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, CheckCircle2, CircleX, Expand, Leaf, MessageSquarePlus, Minus, PenLine, RotateCcw, Shrink, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { readApiResponse, progressType } from '@/lib/api-response';
import { type Change, validateChanges } from '@/lib/director';
import { applyStageChanges, undoStageChanges, selectionSource, type DirectorSelection } from '@/lib/director-stage';
import { type Project, type Shot, type Stage } from '@/lib/studio';
import { promptEditorText } from '@/components/prompt-editor';

type Message = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  status?: 'success' | 'error' | 'undone';
  summary?: string[];
  changes?: Change[];
  recordId?: string;
  selection?: DirectorSelection;
  originalSelection?: DirectorSelection;
  shotSnapshots?: { before: Shot; after: Shot }[];
};
type Launch = { nonce: number; instruction?: string; panel?: string; scope?: string };
const fieldNames: Record<string, string> = { brief: '创意', story: '故事', script: '剧本', scenes: '分场', title: '标题', prompt: '提示词', description: '画面描述', dialogue: '台词', duration: '时长', size: '景别', camera: '运镜', scene: '场景', character: '人物', name: '名称' };
const stageSuggestions: Record<string, string[]> = {
  创意: ['加强核心冲突与转折', '明确受众和短片主题', '让创意更容易拍摄'],
  故事: ['检查人物动机与故事因果', '增加有依据的反转情节', '压缩故事中的重复内容'],
  剧本: ['优化对白，让表达更自然', '调整剧情节奏与场次衔接', '检查剧本中的人物和道具一致性'],
  分镜: ['优化分镜提示词', '检查镜头之间的连续性', '调整景别与运镜'],
  分场: ['检查场次的时空连续性', '明确各场事件与人物行动'],
  资产: ['检查资产设定的一致性', '让资产描述更清晰'],
};
const displayStage = (stage: Stage) => stage === '剪辑' ? '成品导出' : stage;
const messageId = () => Date.now() + Math.random();
function clampPanelSize(value: { width: number; height: number }) {
  return {
    width: Math.max(Math.min(320, window.innerWidth - 32), Math.min(value.width, window.innerWidth - 48)),
    height: Math.max(Math.min(360, window.innerHeight - 110), Math.min(value.height, window.innerHeight - 110)),
  };
}

function selectionOffset(root: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return promptEditorText(range.cloneContents()).length;
}
function changeSummary(project: Project, change: Change) {
  let prefix = '';
  if (change.target === 'shot') prefix = `分镜 ${project.shots.findIndex((shot) => shot.id === change.id) + 1} · `;
  if (change.target === 'asset') {
    const asset = project.assets.find((asset) => asset.id === change.id);
    prefix = `${asset ? asset.name : '资产'} · `;
  }
  return prefix + (fieldNames[change.field] || change.field) + '已修改';
}

export function DirectorChat({ project, stage, shotId, disabled, launch, onConsumeLaunch, onApply }: {
  project: Project;
  stage: Stage;
  shotId?: string;
  disabled: boolean;
  launch?: Launch;
  onConsumeLaunch: () => void;
  onApply: (update: (latest: Project) => Project, message: string) => Project;
}) {
  const [expanded, setExpanded] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [size, setSize] = useState({ width: 440, height: 640 });
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [context, setContext] = useState<DirectorSelection>();
  const [candidate, setCandidate] = useState<{ selection: DirectorSelection; x: number; y: number }>();
  const latest = useRef(project);
  useLayoutEffect(() => { latest.current = project; }, [project]);
  const active = useRef(true);
  const pending = useRef<AbortController | null>(null);
  const lastLaunch = useRef<number | undefined>(undefined);
  const input = useRef<HTMLTextAreaElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; width: number; height: number; axis: 'both' | 'width' | 'height' } | undefined>(undefined);
  const sessionKey = `director-chat:${project.id}:${stage}`;
  const cancelPending = useEffectEvent(() => { const request = pending.current; if (request) request.abort(); });

  useEffect(() => {
    active.current = true;
    const frame = requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(sessionStorage.getItem(sessionKey) || '[]');
        if (Array.isArray(saved)) setMessages(saved.filter((message) => ['user', 'assistant'].includes(message.role) && typeof message.content === 'string').slice(-40));
        const savedSize = JSON.parse(localStorage.getItem('director-chat-size') || 'null');
        if (savedSize && Number.isFinite(savedSize.width) && Number.isFinite(savedSize.height)) setSize(clampPanelSize(savedSize));
      } catch { /* Storage is optional. */ }
      setLoaded(true);
    });
    return () => { cancelAnimationFrame(frame); active.current = false; cancelPending(); };
  }, [sessionKey]);

  useEffect(() => {
    if (!loaded) return;
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify(messages.slice(-40).map(({ changes: _changes, recordId: _recordId, selection: _selection, originalSelection: _originalSelection, shotSnapshots: _snapshots, ...message }) => message)));
    } catch { /* Conversation remains available in memory. */ }
  }, [messages, loaded, sessionKey]);

  useEffect(() => {
    if (!project.changeLog?.at(-1)?.undo) return;
    const recordId = project.changeLog.at(-2)?.id;
    const message = messages.find((item) => item.recordId === recordId && item.status === 'success');
    if (!message) return;
    const frame = requestAnimationFrame(() => {
      if (message.originalSelection) setContext(message.originalSelection);
      setMessages((all) => all.map((item) => item.id === message.id ? { ...item, status: 'undone' } : item));
    });
    return () => cancelAnimationFrame(frame);
  }, [project.changeLog, messages]);

  useEffect(() => {
    if (expanded) scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'auto' });
  }, [messages, busy, expanded]);

  useEffect(() => {
    const resize = () => { setSize((value) => clampPanelSize(value)); setCandidate(undefined); };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    const capture = (event?: globalThis.PointerEvent) => {
      if (event && event.target instanceof Element && event.target.closest('.director-chat, .director-selection-action')) return;
      const focused = document.activeElement;
      let root: HTMLElement | null = null;
      let start = 0, end = 0;
      let point = { x: event?.clientX || 0, y: event?.clientY || 0 };
      if (focused instanceof HTMLTextAreaElement && !focused.readOnly && !focused.disabled) {
        root = focused;
        start = focused.selectionStart; end = focused.selectionEnd;
      } else {
        const selection = window.getSelection();
        if (selection?.rangeCount && !selection.isCollapsed) {
          const range = selection.getRangeAt(0);
          const node = range.commonAncestorContainer;
          const element = node instanceof Element ? node : node.parentElement;
          root = element ? element.closest('[data-director-target]') as HTMLElement | null : null;
          if (root && root.contains(range.startContainer) && root.contains(range.endContainer)) {
            if (root.dataset.directorField === 'script') {
              const endpoint = (node: Node, offset: number) => {
                if (node === root) {
                  const line = root.children[offset] as HTMLElement | undefined;
                  return line ? Number(line.dataset.directorLineStart) : latest.current.script.length;
                }
                const element = node instanceof Element ? node : node.parentElement;
                const line = element ? element.closest('[data-director-line-start]') as HTMLElement | null : null;
                if (!line) throw Error('无法定位选区');
                return Number(line.dataset.directorLineStart) + Math.min(Number(line.dataset.directorLineLength), selectionOffset(line, node, offset));
              };
              try { start = endpoint(range.startContainer, range.startOffset); end = endpoint(range.endContainer, range.endOffset); } catch { root = null; }
            } else {
              start = selectionOffset(root, range.startContainer, range.startOffset);
              end = selectionOffset(root, range.endContainer, range.endOffset);
            }
            const rect = range.getBoundingClientRect(); point = { x: rect.left, y: rect.bottom };
          }
        }
      }
      if (!root || end <= start || root.closest('.director-chat') || root.dataset.directorReadonly === 'true') { setCandidate(undefined); return; }
      const target = root.dataset.directorTarget || (root.dataset.stageField ? 'project' : '');
      const field = root.dataset.directorField || root.dataset.stageField;
      if (!['project', 'shot', 'asset'].includes(target) || !field) { setCandidate(undefined); return; }
      const offset = Number(root.dataset.directorOffset || 0);
      start += offset; end += offset;
      let text = '';
      if (root instanceof HTMLTextAreaElement) text = root.value.slice(start - offset, end - offset);
      else if (field === 'script') text = latest.current.script.slice(start, end);
      else {
        const range = window.getSelection()?.getRangeAt(0);
        if (range) text = promptEditorText(range.cloneContents());
      }
      const selected: DirectorSelection = { target: target as DirectorSelection['target'], id: root.dataset.directorId || latest.current.id, field, start, end, text };
      try { selectionSource(latest.current, stage, selected); } catch { setCandidate(undefined); return; }
      const bounds = root.getBoundingClientRect();
      setCandidate({ selection: selected, x: Math.max(8, Math.min(point.x || bounds.right - 110, window.innerWidth - 116)), y: Math.max(8, Math.min((point.y || bounds.top) + 8, window.innerHeight - 48)) });
    };
    const pointer = (event: globalThis.PointerEvent) => capture(event);
    const keyboard = (event: KeyboardEvent) => { if (event.shiftKey || event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a')) capture(); };
    const clear = () => setCandidate(undefined);
    document.addEventListener('pointerup', pointer);
    document.addEventListener('keyup', keyboard);
    window.addEventListener('scroll', clear, true);
    return () => { document.removeEventListener('pointerup', pointer); document.removeEventListener('keyup', keyboard); window.removeEventListener('scroll', clear, true); };
  }, [stage]);

  function beginResize(event: PointerEvent<HTMLButtonElement>, axis: 'both' | 'width' | 'height') {
    if (!panel.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = panel.current.getBoundingClientRect();
    drag.current = { x: event.clientX, y: event.clientY, width: bounds.width, height: bounds.height, axis };
    setMaximized(false);
  }
  function resize(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const original = drag.current;
    setSize(clampPanelSize({ width: original.width + (original.axis === 'height' ? 0 : original.x - event.clientX), height: original.height + (original.axis === 'width' ? 0 : original.y - event.clientY) }));
  }
  function finishResize() {
    drag.current = undefined;
    try { localStorage.setItem('director-chat-size', JSON.stringify(size)); } catch { /* Optional preference. */ }
  }

  async function send(value = instruction, options?: { shotId?: string; withoutSelection?: boolean }) {
    const text = value.trim();
    if (!text || disabled || pending.current) return;
    const snapshot = latest.current;
    const selected = options?.withoutSelection ? undefined : context;
    const request = new AbortController(); pending.current = request;
    setInstruction(''); setCandidate(undefined); setBusy(true); setSeconds(0);
    setMessages((all) => [...all, { id: messageId(), role: 'user', content: text + (selected ? `\n\n选中片段：${selected.text}` : '') }]);
    try {
      if (selected) selectionSource(snapshot, stage, selected);
      const response = await fetch('/api/director', {
        method: 'POST', signal: request.signal,
        headers: { 'Content-Type': 'application/json', Accept: progressType },
        body: JSON.stringify({ project: snapshot, stage, instruction: text, selection: selected, shotId: options?.shotId,
          history: messages.slice(-8).filter((message) => message.status !== 'error').map((message) => ({ role: message.role, content: message.content.slice(0, 1200) })) }),
      });
      const answer = await readApiResponse<{ reply: string; changes: Change[] }>(response, (seconds) => { if (active.current) setSeconds(seconds); });
      if (!active.current || request.signal.aborted) return;
      const changes = validateChanges(snapshot, answer);
      let recordId: string | undefined;
      let shotSnapshots: Message['shotSnapshots'];
      let undoSelection = selected;
      if (changes.length) {
        const next = onApply((current) => {
          if (current.id !== snapshot.id) throw Error('项目已切换，本次修改未应用');
          if (selected) selectionSource(current, stage, selected);
          const updated = applyStageChanges(current, stage, changes, text, selected);
          const changedIds = new Set(changes.filter((change) => change.target === 'shot').map((change) => change.id));
          shotSnapshots = current.shots.filter((shot) => changedIds.has(shot.id)).map((shot) => ({ before: structuredClone(shot), after: structuredClone(updated.shots.find((item) => item.id === shot.id)!) }));
          return updated;
        }, `AI 导演助手已修改${displayStage(stage)}的 ${changes.length} 处内容`);
        const record = next.changeLog && next.changeLog.at(-1);
        recordId = record ? record.id : undefined;
        if (selected) {
          const oldSource = selectionSource(snapshot, stage, selected);
          const selectedChange = changes.find((change) => change.field === selected.field);
          const newSource = selected.field === 'visual' ? String(changes[0].after) : String(selectedChange ? selectedChange.after : '');
          const length = newSource.length - oldSource.length + selected.end - selected.start;
          undoSelection = { ...selected, end: selected.start + length, text: newSource.slice(selected.start, selected.start + length) };
          setContext(undoSelection.text.trim() && length > 0 ? undoSelection : undefined);
        }
      }
      setMessages((all) => [...all, { id: messageId(), role: 'assistant', content: answer.reply || '已完成修改。', status: changes.length ? 'success' : undefined, recordId, changes, selection: undoSelection, originalSelection: selected, shotSnapshots,
        summary: changes.map((change) => changeSummary(snapshot, change)) }]);
    } catch (error) {
      if (active.current && !request.signal.aborted) setMessages((all) => [...all, { id: messageId(), role: 'assistant', status: 'error', content: error instanceof Error ? error.message : '请求失败，原内容未修改' }]);
    } finally {
      if (pending.current === request) pending.current = null;
      if (active.current) setBusy(false);
    }
  }

  const receiveLaunch = useEffectEvent((entry: Launch) => {
    if (lastLaunch.current === entry.nonce) return;
    lastLaunch.current = entry.nonce;
    setExpanded(true);
    if (entry.instruction) {
      setContext(undefined);
      void send(entry.instruction, { shotId: entry.scope === 'shot' ? shotId : undefined, withoutSelection: true });
    }
    else requestAnimationFrame(() => input.current?.focus());
    onConsumeLaunch();
  });
  useEffect(() => {
    if (!loaded || !launch || launch.panel) return;
    const frame = requestAnimationFrame(() => receiveLaunch(launch));
    return () => cancelAnimationFrame(frame);
    // Launches are discrete user actions; ordinary message updates must not resend.
  }, [launch, loaded]);

  function undo(message: Message) {
    try {
      onApply((current) => {
        return undoStageChanges(current, stage, { recordId: message.recordId || '', changes: message.changes || [], shotSnapshots: message.shotSnapshots });
      }, '已撤销这次助手修改');
      if (message.originalSelection) setContext(message.originalSelection);
      setMessages((all) => all.map((item) => item.id === message.id ? { ...item, status: 'undone' } : item));
    } catch (error) {
      setMessages((all) => [...all, { id: messageId(), role: 'assistant', status: 'error', content: error instanceof Error ? error.message : '撤销失败' }]);
    }
  }

  const scope = context ? `仅修改选中片段 · ${context.text.length} 字` : `当前${displayStage(stage)}环节`;
  return <>
    {candidate && !disabled && createPortal(<Button className="director-selection-action" style={{ left: candidate.x, top: candidate.y }} onPointerDown={(event) => event.preventDefault()} onClick={() => { setContext(candidate.selection); setExpanded(true); setCandidate(undefined); requestAnimationFrame(() => input.current?.focus()); }}><Sparkles />AI 修改</Button>, document.body)}
    <div className="director-island">
      <Button className="director-island-toggle" aria-expanded={expanded} aria-controls="director-chat-panel" onClick={() => setExpanded(!expanded)}><Sparkles />AI 导演助手 <span>{expanded ? '收起 −' : '展开 +'}</span></Button>
      <aside id="director-chat-panel" ref={panel} hidden={!expanded} className={`director-chat${maximized ? ' director-chat-maximized' : ''}`} aria-label="AI 导演助手" style={{ width: size.width, height: size.height }}>
        {(['both', 'width', 'height'] as const).map((axis) => <button key={axis} type="button" className={`director-resize director-resize-${axis}`} aria-label={axis === 'both' ? '拖拽调整助手大小' : axis === 'width' ? '调整助手宽度' : '调整助手高度'} title="拖拽调整大小；方向键微调" onPointerDown={(event) => beginResize(event, axis)} onPointerMove={resize} onPointerUp={finishResize} onPointerCancel={finishResize} onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault(); setMaximized(false); setSize((value) => clampPanelSize({ width: value.width + (event.key === 'ArrowLeft' ? 20 : event.key === 'ArrowRight' ? -20 : 0), height: value.height + (event.key === 'ArrowUp' ? 20 : event.key === 'ArrowDown' ? -20 : 0) }));
        }} />)}
        <header className="director-chat-header">
          <div><Sparkles /><div><h2>AI 导演助手</h2><p>{project.title} · {displayStage(stage)}</p></div></div>
          <nav aria-label="助手面板操作">
            <Button variant="ghost" size="icon" aria-label="新对话" title="新对话" disabled={busy} onClick={() => { setMessages([]); setContext(undefined); input.current?.focus(); }}><MessageSquarePlus /></Button>
            <Button variant="ghost" size="icon" aria-label={maximized ? '还原面板' : '放大面板'} title={maximized ? '还原' : '放大'} onClick={() => setMaximized(!maximized)}>{maximized ? <Shrink /> : <Expand />}</Button>
            <Button variant="ghost" size="icon" aria-label="收起助手" title="收起" onClick={() => setExpanded(false)}><Minus /></Button>
          </nav>
        </header>
        <div className="director-chat-messages" ref={scroll} role="log" aria-label="导演助手对话" aria-live="polite" aria-relevant="additions">
          {!messages.length && <div className="director-chat-welcome"><span><Sparkles /></span><h3>一起打磨这段{displayStage(stage) === '创意' ? '创意' : '内容'}</h3><p>告诉我你想怎么改，我会直接调整当前{displayStage(stage)}的内容。</p><div className="director-chat-suggestions">{(stageSuggestions[stage] || ['检查当前环节的完成情况', '说明下一步如何操作']).map((suggestion) => <Button key={suggestion} variant="outline" disabled={busy || disabled} onClick={() => void send(suggestion)}><Sparkles />{suggestion}</Button>)}</div></div>}
          {messages.map((message) => <article key={message.id} className={`director-message director-message-${message.role}`}>
            <div className="director-message-label">{message.role === 'user' ? '你' : <><Sparkles />导演助手</>}</div>
            {message.role === 'assistant' && message.status && <div className={`director-change-status director-change-${message.status}`}>{message.status === 'error' ? <CircleX /> : message.status === 'undone' ? <RotateCcw /> : <CheckCircle2 />}{message.status === 'error' ? '未应用修改' : message.status === 'undone' ? '已撤销修改' : '已完成修改'}</div>}
            <p className="director-message-content">{message.content}</p>
            {message.summary?.length ? <div className="director-change-list">{message.summary.map((summary, index) => <span key={index}><PenLine />{message.status === 'undone' ? summary.replace('已修改', '修改已撤销') : summary}{message.status === 'success' && <CheckCircle2 />}</span>)}</div> : null}
            {message.recordId && message.status === 'success' && project.changeLog?.at(-1)?.id === message.recordId && <Button variant="ghost" size="sm" disabled={busy || disabled} onClick={() => undo(message)}><RotateCcw />撤销这次修改</Button>}
          </article>)}
          {busy && <output className="director-thinking"><span className="director-thinking-dots"><i /><i /><i /></span>正在思考并调整{context ? '选中片段' : displayStage(stage)}{seconds >= 5 ? ` · ${seconds} 秒` : ''}</output>}
        </div>
        <form className="director-chat-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
          {context && <div className="director-context"><Leaf /><div><p>{context.text}</p><small>已附带选中片段 · {fieldNames[context.field] || (context.field === 'visual' ? '提示词' : context.field)} · {context.text.length} 字</small></div><Button type="button" variant="ghost" size="icon" aria-label="移除选中片段" onClick={() => setContext(undefined)}><X /></Button></div>}
          <label className="director-chat-input"><span className="sr-only">对导演助手说</span><textarea ref={input} aria-label="对导演助手说" rows={3} value={instruction} maxLength={4000} disabled={disabled} placeholder={context ? '这段内容，你想怎么改？' : '告诉我你的想法，或直接提出修改要求…'} onChange={(event) => setInstruction(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} /><div><small>{scope}</small><Button type="submit" size="icon" aria-label="发送消息" title="发送消息" disabled={busy || disabled || !instruction.trim()}><ArrowUp /></Button></div></label>
          <small className="director-composer-hint">Enter 发送 · Shift + Enter 换行</small>
        </form>
      </aside>
    </div>
  </>;
}
