import { useEffect, useState } from 'preact/hooks';
import type { Stats } from '../common/messages';
import {
  closeCallLine,
  DEFAULT_VISION_MODEL,
  MAX_CORRECTIONS,
  spendPreset,
  spendPresets,
  type SpendPreset,
  usesClassifier,
} from '../common/settings';
import { Alert, ChevronRight, Close } from './icons';
import * as fmt from './format';
import { lists, type ListKey } from './ListSheet';
import { Field, NumberField, RangeField, Segmented, ToggleRow, type SettingsEditor } from './ui';
import { ConfidenceZones, ImageRange, linesNote, rangeNote } from './Zones';

export type XTab = 'filtering' | 'rules' | 'appearance' | 'advanced' | 'activity';

// A hidden post is one the reader did not have to read past. This is roughly
// the time a post holds the eye on the way by, and the number is labelled as
// the estimate it is.
export const SECONDS_PER_POST = 6;

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
    // Absent where there are no keyboard shortcuts to bind, as on Android.
    // Reading through it unguarded throws before the rejection handler exists.
    void chrome.commands?.getAll().then(setCommands, () => {});
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

  if (tab === 'appearance') {
    return (
      <div class="panel">
        <section class="group">
          <h2>Hidden posts</h2>
          <Segmented
            label="Hidden post appearance"
            value={settings.hideStyle}
            onChange={(value) => update('hideStyle', value)}
            options={[
              { value: 'collapse', label: 'Collapse' },
              { value: 'blur', label: 'Blur' },
            ]}
          />
          <p class="note tight">Either way a banner stays and one click reveals the post.</p>
          <ToggleRow
            label="Show who wrote it"
            hint="The author's name on the banner."
            checked={settings.showAuthor}
            onChange={(value) => update('showAuthor', value)}
          />
          <ToggleRow
            label="Hide completely when the model is sure"
            hint="Blocked posts not visible at all if the model is sure"
            checked={settings.hideFully}
            onChange={(value) => update('hideFully', value)}
          />
        </section>

        <section class="group">
          <h2>Greyscale</h2>
          <ToggleRow
            label="Greyscale UI"
            checked={settings.greyscaleUi}
            onChange={(value) => update('greyscaleUi', value)}
          />
          <ToggleRow
            label="Greyscale content"
            checked={settings.greyscaleContent}
            onChange={(value) => update('greyscaleContent', value)}
          />
        </section>
      </div>
    );
  }

  if (tab === 'advanced') {
    const classifier = usesClassifier(settings);
    const line = closeCallLine(settings);
    const hidePct = Math.round(settings.hideFrom * 100);
    const linePct = Math.round(line * 100);
    return (
      <div class="panel">
        <section class="group">
          <h2>Mode</h2>
          <Segmented
            label="Who judges posts on X"
            value={classifier ? 'classifier' : 'llm'}
            onChange={(value) => update('decisionMode', value)}
            options={[
              { value: 'classifier', label: 'Classifier' },
              { value: 'llm', label: 'Language model' },
            ]}
          />
          <p class="note tight">
            {classifier
              ? 'A decision model scores every post: how sure it is the post matches your filter. Fast and nearly free.'
              : 'A chat model of your choice reads posts in batches and gives a short reason for each hide. Slower and costs more.'}{' '}
            Keys for both live under General › AI.
          </p>
        </section>

        {classifier ? (
          <section class="group">
            <h2>Speed</h2>
            <RangeField
              label="Posts at once"
              min={1}
              max={64}
              step={1}
              value={settings.classifierConcurrency}
              display={String(settings.classifierConcurrency)}
              onChange={(next) => update('classifierConcurrency', next)}
            />
            <p class="note tight">
              Each post is its own request, so this is how many run at once, across every tab. More
              settles the timeline faster; the cost per post is the same either way.
            </p>
          </section>
        ) : (
          <section class="group">
            <h2>Spending</h2>
            <Segmented
              label="Spending preset"
              value={spendPreset(settings)}
              onChange={(value) => {
                if (value === 'custom') return;
                const preset = spendPresets[value];
                update('batchSize', preset.batchSize);
                update('concurrency', preset.concurrency);
              }}
              options={[
                ...(
                  Object.entries(spendPresets) as [
                    SpendPreset,
                    (typeof spendPresets)[keyof typeof spendPresets],
                  ][]
                ).map(([value, preset]) => ({ value, label: `${preset.cost} ${preset.label}` })),
                { value: 'custom' as SpendPreset, label: 'Custom' },
              ]}
            />
            <div class="pair">
              <RangeField
                label="Posts per request"
                min={1}
                max={30}
                step={1}
                value={settings.batchSize}
                display={String(settings.batchSize)}
                onChange={(next) => update('batchSize', next)}
              />
              <RangeField
                label="Requests at once"
                min={1}
                max={12}
                step={1}
                value={settings.concurrency}
                display={String(settings.concurrency)}
                onChange={(next) => update('concurrency', next)}
              />
            </div>
            <p class="note tight">
              {spendPreset(settings) === 'low'
                ? 'Fewest requests, so the least paid for instructions. Posts settle a little later.'
                : spendPreset(settings) === 'high'
                  ? 'Small batches in parallel settle the timeline fastest. Every request repeats the instructions, so this costs the most.'
                  : spendPreset(settings) === 'medium'
                    ? 'Batches of a dozen, three in flight. A sensible middle.'
                    : 'Each request repeats the instructions, so bigger batches cost less per post. More requests at once settle the timeline sooner.'}
            </p>
          </section>
        )}

        {classifier ? (
          <section class="group">
            <h2>Confidence</h2>
            <ConfidenceZones hide={settings.hideFrom} line={line} />
            <RangeField
              label="Hide from"
              min={0}
              max={100}
              step={1}
              value={hidePct}
              display={`${hidePct}%`}
              onChange={(next) => update('hideFrom', next / 100)}
            />
            <RangeField
              label="Close-call margin"
              min={0}
              max={Math.max(1, 100 - hidePct)}
              step={1}
              value={linePct - hidePct}
              display={linePct === hidePct ? 'None' : `${linePct - hidePct}%`}
              onChange={(next) => update('closeCallMargin', next / 100)}
            />
            <p class="note tight">{linesNote(settings.hideFrom, line)}</p>
          </section>
        ) : (
          <section class="group">
            <h2>Confidence</h2>
            <p class="note">
              The hide and close-call lines belong to the classifier. A language model decides now,
              and makes that call itself.
            </p>
          </section>
        )}

        <section class="group">
          <h2>Images</h2>
          {classifier && (
            <Field
              label="Image model"
              hint="Describes each image and transcribes its text, since the classifier cannot see. Cached per image."
            >
              <input
                value={settings.visionModel}
                spellcheck={false}
                placeholder={DEFAULT_VISION_MODEL}
                onInput={(event) =>
                  update('visionModel', event.currentTarget.value.trim() || DEFAULT_VISION_MODEL)
                }
              />
            </Field>
          )}
          {classifier && (
            <>
              <ImageRange
                hide={settings.hideFrom}
                line={line}
                from={settings.imageCheckFrom}
                below={settings.imageCheckBelow}
                disabled={!settings.analyzeImages}
                onChange={(from, below) => {
                  update('imageCheckFrom', from);
                  update('imageCheckBelow', below);
                }}
              />
              <p class="note tight">
                {settings.analyzeImages
                  ? rangeNote(settings.imageCheckFrom, settings.imageCheckBelow)
                  : 'Sending photos is off, so no images are described. Turn it on under Filtering.'}
              </p>
            </>
          )}
          <NumberField
            label="Max images per post"
            min={1}
            max={4}
            value={settings.maxImagesPerPost}
            onChange={(value) => update('maxImagesPerPost', value)}
          />
          <p class="note tight">Only used while sending photos is on, under Filtering.</p>
        </section>

        <section class="group">
          <h2>Lookahead</h2>
          <RangeField
            label="Judge posts within"
            min={0}
            max={500}
            step={25}
            value={settings.lookahead}
            display={`${settings.lookahead}vh`}
            onChange={(next) => update('lookahead', next)}
          />
          <p class="note tight">
            {settings.lookahead === 0
              ? 'Only posts on screen are judged, so you will watch them resolve.'
              : `Posts within ${settings.lookahead / 100} screens of the viewport are judged early, so most have settled before you reach them. Higher costs more requests.`}
          </p>
        </section>
      </div>
    );
  }

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

        <section class="group">
          <h2>Teach X too</h2>
          <ToggleRow
            label="Mark hidden posts “Not interested”"
            hint="On the Home timeline, Sharp sends X's own “Not interested in this post” for each hidden post, so X's ranking learns as well. Close calls are never reported."
            checked={settings.notInterested}
            onChange={(value) => update('notInterested', value)}
          />
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
            <div>
              <b>≈{fmt.duration((stats?.hidden ?? 0) * SECONDS_PER_POST)}</b>
              <span>Time saved</span>
            </div>
          </div>
          <p class="note tight">
            Time saved assumes about {SECONDS_PER_POST} seconds of attention per hidden post.
          </p>
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
            <b>No AI connected.</b> Sharp reads nothing and hides nothing until you add a key.
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
        <h2>Comments</h2>
        <ToggleRow
          label="Filter comments"
          hint={
            settings.filterComments
              ? 'Replies under a post are judged like any other post.'
              : 'Replies under a post are left alone. Only the timeline is filtered.'
          }
          checked={settings.filterComments}
          onChange={(value) => update('filterComments', value)}
        />
      </section>

      {settings.corrections.length > 0 && (
        <section class="group">
          <h2>Corrections</h2>
          <p class="note tight">
            Posts you overruled with “Keep posts like this” or “Hide posts like this”. Sent with
            every batch as examples of your judgement; the newest {MAX_CORRECTIONS} are kept.
          </p>
          <div class="tokens">
            {settings.corrections.map((entry) => (
              <span key={`${entry.at}:${entry.text}`} class={`token ${entry.hide ? '' : 'accent'}`}>
                <span title={entry.text}>
                  {entry.hide ? 'Hide' : 'Keep'} · @{entry.handle}: {entry.text}
                </span>
                <button
                  type="button"
                  aria-label={`Forget this correction`}
                  onClick={() =>
                    update(
                      'corrections',
                      settings.corrections.filter((other) => other !== entry),
                    )
                  }
                >
                  <Close />
                </button>
              </span>
            ))}
          </div>
          <div class="actions">
            <button type="button" class="btn small" onClick={() => update('corrections', [])}>
              Forget all corrections
            </button>
          </div>
        </section>
      )}

      <section class="group">
        <h2>Images</h2>
        <ToggleRow
          label="Send photos and video thumbnails"
          hint={
            usesClassifier(settings)
              ? 'Images are described in words for the classifier. Which posts, under Advanced.'
              : 'Needs a vision-capable model and costs more per post.'
          }
          checked={settings.analyzeImages}
          onChange={(value) => update('analyzeImages', value)}
        />
      </section>
    </div>
  );
}
