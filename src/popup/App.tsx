import { useEffect, useState } from 'preact/hooks';
import { Schema } from 'effect';
import { request, type Stats } from '../common/messages';
import { threadId } from '../common/post';
import { Settings, type SettingsPatch } from '../common/settings';
import { GeneralPanel, type GeneralTab } from './GeneralPanel';
import { ListSheet, type ListKey } from './ListSheet';
import { ModelBrowser } from './ModelBrowser';
import { Rail, type Section } from './Rail';
import { XPanel, type XTab } from './XPanel';
import { Notice } from './ui';

type Form = { draft: Settings; saved: Settings };
type Overlay = { kind: 'model'; view: 'models' | 'providers' } | { kind: 'list'; list: ListKey };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function normalize(settings: Settings): Settings {
  const lines = (values: readonly string[], author = false) => [
    ...new Set(
      values.map((value) => value.trim().replace(author ? /^@/ : /^$/, '')).filter(Boolean),
    ),
  ];
  return {
    ...settings,
    criteria: settings.criteria.trim(),
    allowedAuthors: lines(settings.allowedAuthors, true),
    blockedAuthors: lines(settings.blockedAuthors, true),
    blockedWords: lines(settings.blockedWords),
    bypassedThreads: lines(settings.bypassedThreads),
  };
}

export function App() {
  const [form, setForm] = useState<Form | null>(null);
  const [section, setSection] = useState<Section>('x');
  const [xTab, setXTab] = useState<XTab>('filtering');
  const [generalTab, setGeneralTab] = useState<GeneralTab>('connection');
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [bytes, setBytes] = useState(0);
  const [status, setStatus] = useState('');
  const [message, setMessage] = useState<{ text: string; tone: 'bad' | 'good' }>();
  const [thread, setThread] = useState('');
  const [onSite, setOnSite] = useState(false);
  const [busy, setBusy] = useState(false);

  /** Keep an open popup honest about edits made from the timeline, without
   *  discarding fields the reader is still editing here. */
  const absorb = (next: Settings) =>
    setForm((form) => {
      if (!form) return { draft: next, saved: next };
      const draft = { ...form.draft };
      for (const key of Object.keys(next) as (keyof Settings)[]) {
        if (same(draft[key], form.saved[key])) draft[key] = next[key] as never;
      }
      return { draft, saved: next };
    });

  useEffect(() => {
    document.documentElement.dataset.motion = form?.saved.motion ?? 'auto';
  }, [form?.saved.motion]);

  async function refresh() {
    const [settings, nextStats, nextStatus, size] = await Promise.all([
      request({ type: 'GET_SETTINGS' }),
      request({ type: 'GET_STATS' }),
      request({ type: 'GET_STATUS' }),
      request({ type: 'CACHE_SIZE' }),
    ]);
    absorb(settings);
    setStats(nextStats);
    setStatus(nextStatus.error);
    setBytes(size);
  }

  useEffect(() => {
    void refresh().catch((error: unknown) =>
      setMessage({
        text: error instanceof Error ? error.message : 'Could not load settings.',
        tone: 'bad',
      }),
    );
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab?.url || !/^https:\/\/(?:x|twitter)\.com\//.test(tab.url)) return;
      setOnSite(true);
      setThread(threadId(new URL(tab.url).pathname));
    });
    const onChange = (_changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local') void refresh().catch(() => {});
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setMessage(undefined);
    try {
      setMessage({ text: await action(), tone: 'good' });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Operation failed.',
        tone: 'bad',
      });
    } finally {
      setBusy(false);
      await refresh().catch(() => {});
    }
  }

  if (!form) {
    return (
      <div class="shell">
        <Rail section={section} onSite={onSite} onSelect={setSection} />
        <div class="main">
          <div class="body">
            <p class="note">Loading settings…</p>
          </div>
        </div>
      </div>
    );
  }

  const { draft, saved } = form;
  const dirty = !same(draft, saved);
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm((form) => form && { ...form, draft: { ...form.draft, [key]: value } });
  const editor = { settings: draft, update };

  async function save() {
    setMessage(undefined);
    setBusy(true);
    try {
      const next = Schema.decodeUnknownSync(Settings)(normalize(draft));
      if (next.provider === 'custom') {
        const url = new URL(next.customBaseUrl);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
          throw new Error('Use an HTTPS base URL without credentials, query or fragment.');
        }
        // Called from the submit gesture, before any await (required by Chrome).
        const granted = await chrome.permissions.request({ origins: [`${url.origin}/*`] });
        if (!granted) throw new Error('Endpoint permission was not granted.');
      }
      // Only changed fields are sent; unrelated updates from a tab aren't overwritten.
      const patch: SettingsPatch = Object.fromEntries(
        Object.entries(next).filter(([key, value]) => !same(value, saved[key as keyof Settings])),
      );
      const result = await request({ type: 'PATCH_SETTINGS', patch });
      setForm({ draft: result, saved: result });
      setMessage({ text: 'Saved. Open X tabs picked it up.', tone: 'good' });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Could not save settings.',
        tone: 'bad',
      });
    } finally {
      setBusy(false);
    }
  }

  /** Immediate, single-field writes for actions that are their own commit. */
  const persist = (patch: SettingsPatch, note: string) =>
    void run(async () => {
      const result = await request({ type: 'PATCH_SETTINGS', patch });
      setForm((form) => form && { draft: { ...form.draft, ...patch }, saved: result });
      return note;
    });

  const power = (enabled: boolean) =>
    void run(async () => {
      const result = await request({ type: 'PATCH_SETTINGS', patch: { enabled } });
      setForm((form) => form && { ...form, draft: { ...form.draft, enabled }, saved: result });
      return enabled ? 'Filtering is on.' : 'Filtering is off. Nothing is hidden.';
    });

  const connected = Boolean(saved.apiKeys[saved.provider] && saved.model);
  const footer = dirty || busy || Boolean(message);

  return (
    <form
      class="shell"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Rail section={section} onSite={onSite} onSelect={setSection} />

      <div class="main">
        <nav class="tabs" role="tablist">
          {(section === 'x'
            ? ([
                ['filtering', 'Filtering'],
                ['rules', 'Rules'],
                ['activity', 'Activity'],
              ] as const)
            : ([
                ['connection', 'Connection'],
                ['appearance', 'Appearance'],
                ['about', 'About'],
              ] as const)
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              class="tab"
              role="tab"
              aria-selected={(section === 'x' ? xTab : generalTab) === id}
              onClick={() =>
                section === 'x' ? setXTab(id as XTab) : setGeneralTab(id as GeneralTab)
              }
            >
              {label}
              {id === 'activity' && status ? <span class="count">!</span> : null}
            </button>
          ))}
        </nav>

        <div class="body">
          {(status || message?.tone === 'bad') && (
            <div class="alerts">
              {status && <Notice tone="bad">{status}</Notice>}
              {message?.tone === 'bad' && <Notice tone="bad">{message.text}</Notice>}
            </div>
          )}
          {section === 'x' ? (
            <XPanel
              {...editor}
              tab={xTab}
              enabled={saved.enabled}
              onPower={power}
              dirty={dirty}
              busy={busy}
              connected={connected}
              stats={stats}
              thread={thread}
              onApply={() => void save()}
              onOpenConnection={() => {
                setSection('general');
                setGeneralTab('connection');
              }}
              onOpenList={(list) => setOverlay({ kind: 'list', list })}
              onSavePreset={(name) =>
                persist(
                  {
                    presets: [
                      ...draft.presets.filter((preset) => preset.name !== name),
                      { name, criteria: draft.criteria },
                    ],
                  },
                  `Saved the preset “${name}”.`,
                )
              }
              onDeletePreset={(name) =>
                persist(
                  { presets: draft.presets.filter((preset) => preset.name !== name) },
                  'Preset deleted.',
                )
              }
              onResetStats={() =>
                void run(async () => {
                  await request({ type: 'RESET_STATS' });
                  return 'Counters reset.';
                })
              }
              onToggleThread={() =>
                void run(async () => {
                  const active = await request({
                    type: 'TOGGLE_LIST',
                    list: 'bypassedThreads',
                    value: thread,
                  });
                  return active ? 'This thread is now unfiltered.' : 'Filtering restored here.';
                })
              }
            />
          ) : (
            <GeneralPanel
              {...editor}
              tab={generalTab}
              busy={busy}
              bytes={bytes}
              onBrowse={(view) => setOverlay({ kind: 'model', view })}
              onTest={() => void run(() => request({ type: 'TEST_CONNECTION' }))}
              onClearCache={() =>
                void run(async () => {
                  await request({ type: 'CLEAR_CACHE' });
                  return 'Verdict cache cleared.';
                })
              }
            />
          )}
        </div>

        {footer && (
          <footer class="savebar">
            <span class={`status ${dirty ? 'dirty' : ''}`}>
              {dirty ? 'Unsaved changes' : (message?.text ?? '')}
            </span>
            {dirty && (
              <button
                type="button"
                class="btn quiet small"
                disabled={busy}
                onClick={() => setForm({ draft: saved, saved })}
              >
                Discard
              </button>
            )}
            {dirty && (
              <button type="submit" class="btn primary" disabled={busy}>
                {busy && <span class="spinner" />}
                Save
              </button>
            )}
          </footer>
        )}
      </div>

      {overlay?.kind === 'model' && (
        <ModelBrowser {...editor} initialView={overlay.view} onClose={() => setOverlay(null)} />
      )}
      {overlay?.kind === 'list' && (
        <ListSheet {...editor} list={overlay.list} onClose={() => setOverlay(null)} />
      )}
    </form>
  );
}
