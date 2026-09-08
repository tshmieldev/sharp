import { useEffect, useState } from 'preact/hooks';
import type { Stats } from '../common/messages';
import { Alert, ChevronRight, Close } from './icons';
import { lists, type ListKey } from './ListSheet';
import { ToggleRow, type SettingsEditor } from './ui';

export type XTab = 'filtering' | 'rules' | 'activity';

type Props = SettingsEditor & {
  tab: XTab;
  dirty: boolean;
  busy: boolean;
  connected: boolean;
  enabled: boolean;
  stats: Stats | null;
  thread: string;
  onPower: (enabled: boolean) => void;
  onApply: () => void;
  onSavePreset: (name: string) => void;
  onDeletePreset: (name: string) => void;
  onOpenList: (list: ListKey) => void;
  onOpenConnection: () => void;
  onResetStats: () => void;
  onToggleThread: () => void;
};

// Chrome reports a binding as "Alt+Shift+F" on every platform, but macOS reads
// it as modifier glyphs. Show the user's own binding in their own notation.
const glyphs: Record<string, string> = {
  Command: '\u2318',
  Ctrl: '\u2303',
  MacCtrl: '\u2303',
  Alt: '\u2325',
  Shift: '\u21e7',
};
const mac = /Mac/i.test(navigator.userAgent);
const notation = (shortcut: string) =>
  !shortcut
    ? 'Not set'
    : mac
      ? shortcut
          .split('+')
          .map((part) => glyphs[part] ?? part)
          .join('')
      : shortcut;

function useShortcuts() {
  const [commands, setCommands] = useState<chrome.commands.Command[]>([]);
  useEffect(() => {
    void chrome.commands.getAll().then(setCommands, () => {});
  }, []);
  return commands.filter((command) => command.description);
}

export function XPanel({
  settings,
  update,
  tab,
  dirty,
  busy,
  connected,
  enabled,
  stats,
  thread,
  onPower,
  onApply,
  onSavePreset,
  onDeletePreset,
  onOpenList,
  onOpenConnection,
  onResetStats,
  onToggleThread,
}: Props) {
  const shortcuts = useShortcuts();
  const [presetName, setPresetName] = useState('');
  const [naming, setNaming] = useState(false);
  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    setPresetName('');
    setNaming(false);
    onSavePreset(name);
  };

  if (tab === 'rules') {
    return (
      <div class="panel">
        <section class="group">
          <h2>Rules</h2>
          <p class="note tight">Applied before the model is asked, so they cost nothing.</p>
          {(['allowedAuthors', 'blockedAuthors', 'blockedWords'] as const).map((key) => {
            const count = settings[key].length;
            return (
              <button key={key} type="button" class="model-card" onClick={() => onOpenList(key)}>
                <div>
                  <span class="id">{lists[key].title}</span>
                  <span class="meta">
                    {count
                      ? `${count} ${lists[key].summary}${count === 1 ? '' : 's'}`
                      : `No ${lists[key].summary}s yet`}
                  </span>
                </div>
                <ChevronRight />
              </button>
            );
          })}
        </section>

        {thread && (
          <section class="group">
            <h2>Open thread</h2>
            <div class="actions">
              <button type="button" class="btn" disabled={busy} onClick={onToggleThread}>
                {settings.bypassedThreads.includes(thread)
                  ? 'Filter this thread again'
                  : 'Show every comment in this thread'}
              </button>
            </div>
          </section>
        )}

        {settings.bypassedThreads.length > 0 && (
          <section class="group">
            <h2>Unfiltered threads</h2>
            <div class="tokens">
              {settings.bypassedThreads.map((id) => (
                <span key={id} class="token">
                  <span>{id}</span>
                  <button
                    type="button"
                    aria-label={`Filter thread ${id} again`}
                    onClick={() =>
                      update(
                        'bypassedThreads',
                        settings.bypassedThreads.filter((entry) => entry !== id),
                      )
                    }
                  >
                    <Close />
                  </button>
                </span>
              ))}
            </div>
            <div class="actions">
              <button type="button" class="btn small" onClick={() => update('bypassedThreads', [])}>
                Filter all threads again
              </button>
            </div>
          </section>
        )}
      </div>
    );
  }

  if (tab === 'activity') {
    return (
      <div class="panel">
        <section class="group">
          <h2>Since the last reset</h2>
          <div class="stats">
            <div>
              <b>{(stats?.hidden ?? 0).toLocaleString()}</b>
              <span>Posts hidden</span>
            </div>
            <div>
              <b>{(stats?.requests ?? 0).toLocaleString()}</b>
              <span>Requests</span>
            </div>
            <div>
              <b>{(stats?.tokens ?? 0).toLocaleString()}</b>
              <span>Tokens</span>
            </div>
          </div>
          <div class="actions">
            <button type="button" class="btn small" disabled={busy} onClick={onResetStats}>
              Reset counters
            </button>
          </div>
        </section>

        <section class="group">
          <h2>Shortcuts</h2>
          <div class="keys">
            {shortcuts.map((command) => (
              <div key={command.name}>
                <kbd>{notation(command.shortcut ?? '')}</kbd>
                <span>{command.description}</span>
              </div>
            ))}
          </div>
          <p class="note">
            Author rules also sit at the bottom of a post's ⋯ menu, and the thread control sits
            above the reply box.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div class="panel">
      {!connected && (
        <button type="button" class="callout" onClick={onOpenConnection}>
          <Alert />
          <span>
            <b>No model connected.</b> Sharp reads nothing and hides nothing until you add a
            provider key.
          </span>
          <span class="go">Set up →</span>
        </button>
      )}

      <section class="group">
        <ToggleRow
          label="Filter X"
          hint={enabled ? 'Hiding posts on x.com.' : 'Every post is showing.'}
          checked={enabled}
          onChange={onPower}
        />
      </section>

      <section class="group">
        <h2>What to filter</h2>
        <textarea
          rows={5}
          maxLength={6000}
          placeholder="Say what to hide, or what to keep. Written in plain language and sent to your model with every batch of posts."
          value={settings.criteria}
          onInput={(event) => update('criteria', event.currentTarget.value)}
        />
        <div class="rowline">
          <span class="counter">{settings.criteria.length} / 6000</span>
          <span class="spacer" />
          <button
            type="button"
            class="btn quiet small"
            disabled={!settings.criteria.trim() || naming}
            onClick={() => setNaming(true)}
          >
            Save as preset
          </button>
          <button
            type="button"
            class="btn primary small"
            disabled={!dirty || busy}
            onClick={onApply}
          >
            Apply
          </button>
        </div>
        {naming && (
          <div class="rowline">
            <input
              autofocus
              value={presetName}
              placeholder="Preset name"
              onInput={(event) => setPresetName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setNaming(false);
                if (event.key !== 'Enter') return;
                event.preventDefault();
                savePreset();
              }}
            />
            <button
              type="button"
              class="btn small"
              disabled={!presetName.trim()}
              onClick={savePreset}
            >
              Save
            </button>
            <button type="button" class="btn quiet small" onClick={() => setNaming(false)}>
              Cancel
            </button>
          </div>
        )}
        {settings.presets.length > 0 && (
          <>
            <span class="minilabel">Presets</span>
            <div class="tokens">
              {settings.presets.map((preset) => (
                <span
                  key={preset.name}
                  class={`token ${preset.criteria === settings.criteria ? 'accent' : ''}`}
                >
                  <button
                    type="button"
                    class="token-label"
                    title="Load this preset"
                    onClick={() => update('criteria', preset.criteria)}
                  >
                    {preset.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${preset.name}`}
                    onClick={() => onDeletePreset(preset.name)}
                  >
                    <Close />
                  </button>
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      <section class="group">
        <h2>Images</h2>
        <ToggleRow
          label="Send photos and video thumbnails"
          hint="Needs a vision-capable model and costs more per post."
          checked={settings.analyzeImages}
          onChange={(value) => update('analyzeImages', value)}
        />
      </section>
    </div>
  );
}
