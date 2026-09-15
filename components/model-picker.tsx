'use client';
import type { ModelConfig, ModelKind } from '@/lib/models';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
export function ModelPicker({
  models,
  kind,
  value,
  onChange,
  disabled = false,
  onSettings,
  channels = [],
}: {
  models: ModelConfig[];
  kind: ModelKind;
  value?: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  onSettings?: () => void;
  channels?: { id: string; label: string }[];
}) {
  const choices = models.filter(
    (m) => m.kind === kind && m.enabled && m.hasKey,
  );
  const selected = choices.find((m) => m.id === value);
  const channel = channels.find((c) => c.id === value);
  const fallback = models.find((m) => m.kind === kind && m.isDefault);
  const label = value
    ? channel ? channel.label : selected
      ? `${selected.name} · ${selected.model}`
      : '配置不可用，请重选'
    : `默认：${fallback?.model || '未配置'}`;
  return (
    <Select
      value={value || 'default'}
      disabled={disabled}
      onValueChange={(id) => {
        if (id === 'settings') onSettings?.();
        else if (id) onChange(id === 'default' ? '' : id);
      }}
    >
      <SelectTrigger
        className="model-picker"
        aria-label="选择生成模型"
        title={label}
      >
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="default">
          跟随默认模型{fallback?.model ? ` · ${fallback.model}` : ''}
        </SelectItem>
        {choices.map((m) => (
          <SelectItem key={m.id} value={m.id!}>
            {m.name} · {m.model}
          </SelectItem>
        ))}
        {channels.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
        {value && !selected && !channel && (
          <SelectItem value={value} disabled>
            原配置不可用
          </SelectItem>
        )}
        {onSettings && <SelectItem value="settings">管理模型配置…</SelectItem>}
      </SelectContent>
    </Select>
  );
}
