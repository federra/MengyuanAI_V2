/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Inline noneditable asset tokens require a rich contentEditable textbox rather than a textarea. */
'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Asset } from '@/lib/studio';
import { insertAssetMention, promptParts } from '@/lib/prompt-rich';

const mentionKinds = [
  { kind: '人物', label: '角色' },
  { kind: '场景', label: '场景' },
  { kind: '道具', label: '道具' },
  { kind: '服饰', label: '服饰' },
] as const;
type MentionKind = (typeof mentionKinds)[number]['kind'];
type Mention = { offset: number; kind?: MentionKind; active: number; x: number; y: number };

// Only plain text and application-created asset tokens are written into the editor.
function editorText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return '';
  if (node instanceof HTMLElement && node.dataset.assetText !== undefined) return node.dataset.assetText;
  if (node instanceof HTMLElement && node.tagName === 'BR') return '\n';
  let text = '';
  for (const child of node.childNodes) {
    if (
      child instanceof HTMLElement &&
      ['DIV', 'P'].includes(child.tagName) &&
      text &&
      !text.endsWith('\n')
    )
      text += '\n';
    text += editorText(child);
  }
  return text;
}
function caretOffset(root: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;
  const before = range.cloneRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  return editorText(before.cloneContents()).length;
}
function placeCaret(root: HTMLElement, offset: number) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  let consumed = 0;
  for (const child of root.childNodes) {
    const length = editorText(child).length;
    if (consumed + length >= offset && child.nodeType === Node.TEXT_NODE) {
      range.setStart(child, Math.max(0, offset - consumed));
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    consumed += length;
  }
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
function renderText(root: HTMLElement, text: string, assets: Asset[]) {
  const fragment = document.createDocumentFragment();
  for (const part of promptParts(text, assets)) {
    if (!part.asset) {
      fragment.append(document.createTextNode(part.text));
      continue;
    }
    const token = document.createElement('span');
    token.className = 'inline-asset-token';
    token.contentEditable = 'false';
    token.dataset.assetText = part.text;
    token.dataset.assetId = part.asset.id;
    token.title = `${part.asset.kind}：${part.asset.name}（点击调整匹配）`;
    if (part.asset.image) {
      const img = document.createElement('img');
      img.src = part.asset.image.url;
      img.alt = '';
      img.width = 18;
      img.height = 18;
      img.draggable = false;
      token.appendChild(img);
    }
    token.appendChild(document.createTextNode(part.text));
    fragment.append(token);
  }
  root.replaceChildren(fragment);
}
export function PromptEditor({
  value,
  assets,
  availableAssets,
  disabled,
  label,
  onChange,
  onAsset,
  onInsertAsset,
}: {
  value: string;
  assets: Asset[];
  availableAssets: Asset[];
  disabled: boolean;
  label: string;
  onChange: (text: string) => void;
  onAsset: (asset: Asset) => void;
  onInsertAsset: (text: string, asset: Asset) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const lastInput = useRef<string | null>(null);
  const composing = useRef(false);
  const [error, setError] = useState('');
  const [mention, setMention] = useState<Mention | null>(null);
  const options = mention?.kind
    ? availableAssets.filter((asset) => asset.kind === mention.kind)
    : mentionKinds;
  useEffect(() => {
    if (!root.current) return;
    if (document.activeElement === root.current && lastInput.current === value)
      return;
    renderText(root.current, value, assets);
    lastInput.current = value;
  }, [value, assets]);
  useEffect(() => {
    if (!mention) return;
    const close = () => setMention(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [mention]);
  function update() {
    if (!root.current || composing.current) return;
    const text =
      root.current.childNodes.length === 1 &&
      root.current.firstChild instanceof HTMLBRElement
        ? ''
        : editorText(root.current);
    if (text.length > 10000) {
      setError('提示词最多10000字，请精简内容');
      renderText(root.current, value, assets);
      setMention(null);
      return;
    }
    setError('');
    lastInput.current = text;
    if (text !== value) onChange(text);
    const offset = caretOffset(root.current);
    if (disabled || offset === null || text[offset - 1] !== '@') {
      setMention(null);
      return;
    }
    const rect = window.getSelection()?.getRangeAt(0).getBoundingClientRect();
    const fallback = root.current.getBoundingClientRect();
    setMention({ offset, active: 0, x: Math.min(rect?.left || fallback.left, window.innerWidth - 232), y: Math.min((rect?.bottom || fallback.top) + 5, window.innerHeight - 220) });
  }
  function chooseAsset(asset: Asset) {
    if (!root.current || !mention) return;
    const insertion = insertAssetMention(editorText(root.current), mention.offset, asset.name);
    if (!insertion) { setMention(null); return; }
    renderText(root.current, insertion.text, [...assets, asset]);
    lastInput.current = insertion.text;
    onInsertAsset(insertion.text, asset);
    setMention(null);
    root.current.focus();
    placeCaret(root.current, insertion.caret);
  }
  function chooseOption(index: number) {
    const option = options[index];
    if (!option || !mention) return;
    if (mention.kind) chooseAsset(option as Asset);
    else setMention({ ...mention, kind: (option as (typeof mentionKinds)[number]).kind, active: 0 });
  }
  function insertPlain(text: string) {
    const selection = window.getSelection();
    if (!root.current || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!root.current.contains(range.commonAncestorContainer)) return;
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    update();
  }
  return (
    <>
      <div
        ref={root}
        className="prompt-rich-editor"
        role="textbox"
        aria-label={label}
        aria-multiline="true"
        aria-readonly={disabled}
        aria-haspopup="listbox"
        tabIndex={disabled ? -1 : 0}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder="直接编辑分镜画面、动作、镜头运动和表演要求；输入 @ 可引用角色、场景、道具或服饰。"
        onInput={() => update()}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          update();
        }}
        onBlur={() => {
          if (root.current) {
            update();
            renderText(root.current, lastInput.current ?? value, assets);
          }
          setMention(null);
        }}
        onPaste={(e) => {
          e.preventDefault();
          if (!disabled) insertPlain(e.clipboardData.getData('text/plain'));
        }}
        onDrop={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (mention && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
            e.preventDefault();
            if (e.key === 'Escape') setMention(null);
            else if (e.key === 'ArrowDown') setMention({ ...mention, active: (mention.active + 1) % Math.max(options.length, 1) });
            else if (e.key === 'ArrowUp') setMention({ ...mention, active: (mention.active - 1 + Math.max(options.length, 1)) % Math.max(options.length, 1) });
            else chooseOption(mention.active);
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            insertPlain('\n');
          }
        }}
        onClick={(e) => {
          const token = (e.target as HTMLElement).closest('[data-asset-id]');
          const a = assets.find(
            (a) => a.id === (token as HTMLElement | null)?.dataset.assetId,
          );
          if (a) onAsset(a);
        }}
      />
      {mention && createPortal(
        <div className="prompt-mention-menu" role="listbox" tabIndex={-1} aria-label={mention.kind ? '选择绑定资产' : '选择资产类型'} style={{ left: Math.max(8, mention.x), top: Math.max(8, mention.y) }} onMouseDown={(e) => e.preventDefault()}>
          <div className="prompt-mention-heading">{mention.kind ? `${mentionKinds.find((item) => item.kind === mention.kind)?.label} · 选择资产` : '引用资产'}</div>
          {mention.kind && <button type="button" className="prompt-mention-back" onClick={() => setMention({ ...mention, kind: undefined, active: 0 })}>← 返回分类</button>}
          {options.length ? options.map((option, index) => (
            <button type="button" role="option" aria-selected={index === mention.active} className={index === mention.active ? 'active' : ''} key={mention.kind ? (option as Asset).id : (option as (typeof mentionKinds)[number]).kind} onMouseEnter={() => setMention({ ...mention, active: index })} onClick={() => chooseOption(index)}>
              {mention.kind ? (option as Asset).name : (option as (typeof mentionKinds)[number]).label}
            </button>
          )) : <div className="prompt-mention-empty">暂无可选资产</div>}
        </div>, document.body,
      )}
      {error && <output className="helper">{error}</output>}
    </>
  );
}
