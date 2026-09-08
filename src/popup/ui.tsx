import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Settings } from '../common/settings';
import { Alert, Check, Close, Plus } from './icons';

export type SettingsEditor = {
  settings: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
};

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ComponentChildren;
}) {
  return (
    <label class="field">
      <span>{label}</span>
      {children}
      {hint && <p class="note">{hint}</p>}
    </label>
  );
}

export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <button
      type="button"
      class="switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  );
}
type SwitchProps = { checked: boolean; onChange: (value: boolean) => void; label: string };

export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div class="toggle">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div class="seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'bad' | 'good' | ''; children: string }) {
  return (
    <p class={`notice ${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      {tone === 'bad' ? <Alert /> : tone === 'good' ? <Check /> : null}
      <span>{children}</span>
    </p>
  );
}

export function RangeField({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div class="field">
      <span class="rowline">
        <span>{label}</span>
        <span class="spacer" />
        <b class="range-value">{display}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        style={`--fill:${fill}%`}
        onInput={(event) => onChange(event.currentTarget.valueAsNumber)}
      />
    </div>
  );
}

/** A number field a reader can clear. The DOM reports NaN for an empty input,
 *  which is not a value worth writing anywhere. */
export function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Field label={label}>
      <input
        type="number"
        min={min}
        max={max}
        value={draft ?? String(value)}
        onInput={(event) => {
          const text = event.currentTarget.value;
          setDraft(text);
          const next = Number(text);
          if (text.trim() && Number.isFinite(next) && next >= min && next <= max) onChange(next);
        }}
        onBlur={() => setDraft(null)}
      />
    </Field>
  );
}

/** Editable list of short values. Typing alone never commits; Enter or Add does. */
export function TokenList({
  values,
  onChange,
  placeholder,
  prefix = '',
  empty,
}: {
  values: readonly string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  prefix?: string;
  empty: string;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const entry = draft.trim().replace(/^@/, '');
    if (!entry) return;
    setDraft('');
    if (values.some((value) => value.toLowerCase() === entry.toLowerCase())) return;
    onChange([...values, entry]);
  };
  return (
    <div class="group">
      <div class="rowline">
        <input
          value={draft}
          placeholder={placeholder}
          spellcheck={false}
          onInput={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            add();
          }}
        />
        <button type="button" class="btn" disabled={!draft.trim()} onClick={add}>
          <Plus />
          Add
        </button>
      </div>
      {values.length ? (
        <div class="tokens">
          {values.map((value) => (
            <span key={value} class="token">
              <span>
                {prefix}
                {value}
              </span>
              <button
                type="button"
                aria-label={`Remove ${prefix}${value}`}
                onClick={() => onChange(values.filter((entry) => entry !== value))}
              >
                <Close />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p class="empty">{empty}</p>
      )}
    </div>
  );
}
