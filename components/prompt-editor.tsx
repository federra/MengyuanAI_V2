/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Inline noneditable asset tokens require a rich contentEditable textbox rather than a textarea. */
'use client';
import { useEffect, useRef, useState } from 'react';
import type { Asset } from '@/lib/studio';
import { promptParts } from '@/lib/prompt-rich';

// Only plain text and application-created asset tokens are written into the editor.
function editorText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (!(node instanceof HTMLElement)) return '';
  if (node.dataset.assetText !== undefined) return node.dataset.assetText;
  if (node.tagName === 'BR') return '\n';
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
  disabled,
  label,
  onChange,
  onAsset,
}: {
  value: string;
  assets: Asset[];
  disabled: boolean;
  label: string;
  onChange: (text: string) => void;
  onAsset: (asset: Asset) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const lastInput = useRef<string | null>(null);
  const composing = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!root.current) return;
    if (document.activeElement === root.current && lastInput.current === value)
      return;
    renderText(root.current, value, assets);
    lastInput.current = value;
  }, [value, assets]);
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
      return;
    }
    setError('');
    lastInput.current = text;
    if (text !== value) onChange(text);
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
        tabIndex={disabled ? -1 : 0}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder="直接编辑分镜画面、动作、镜头运动和表演要求；匹配资产会在正文中显示为标签。"
        onInput={update}
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
        }}
        onPaste={(e) => {
          e.preventDefault();
          if (!disabled) insertPlain(e.clipboardData.getData('text/plain'));
        }}
        onDrop={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
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
      {error && <output className="helper">{error}</output>}
    </>
  );
}
