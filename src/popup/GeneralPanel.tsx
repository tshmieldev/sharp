import { useState } from 'preact/hooks';
import {
  classifierProviders,
  providers,
  type ClassifierProvider,
  type Provider,
  usesClassifier,
  visionProvider,
} from '../common/settings';
import { buildId } from '../common/build';
import * as fmt from './format';
import { Check, ChevronRight, Close, Coffee, External, Eye, EyeOff, GitHub, Star } from './icons';
import { Field, Segmented, ToggleRow, type SettingsEditor } from './ui';

export type GeneralTab = 'ai' | 'advanced' | 'appearance' | 'about';

type Props = SettingsEditor & {
  tab: GeneralTab;
  busy: boolean;
  bytes: number;
  onBrowse: (view: 'models' | 'providers') => void;
  onTest: (mode: 'classifier' | 'llm') => void;
  onClearCache: () => void;
};

/** One provider's key: shown masked once saved, replaceable, never synced. */
function KeyField({ id, label, settings, update }: SettingsEditor & { id: string; label: string }) {
  const [reveal, setReveal] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const key = settings.apiKeys[id] ?? '';
  if (key && !replacing) {
    return (
      <div class="status-row">
        <Check />
        <span class="value">{`${label} key ···· ${key.slice(-4)}`}</span>
        <button type="button" class="btn quiet small" onClick={() => setReplacing(true)}>
          Replace key
        </button>
      </div>
    );
  }
  return (
    <>
      <div class="key">
        <input
          type={reveal ? 'text' : 'password'}
          autoComplete="off"
          spellcheck={false}
          aria-label={`${label} API key`}
          placeholder={`Paste your ${label} key`}
          value={key}
          onInput={(event) =>
            update('apiKeys', { ...settings.apiKeys, [id]: event.currentTarget.value.trim() })
          }
        />
        <button
          type="button"
          class="btn icon"
          aria-label={reveal ? 'Hide the API key' : 'Show the API key'}
          onClick={() => setReveal(!reveal)}
        >
          {reveal ? <EyeOff /> : <Eye />}
        </button>
      </div>
      <p class="note tight">
        {key
          ? 'Stored locally in this browser, never synced.'
          : 'Stored locally in this browser. Nothing is filtered until you save one.'}
      </p>
    </>
  );
}

const classifierNotes: Record<ClassifierProvider, string> = {
  openrouter: 'One key covers the classifier and image descriptions. Pay as you go.',
  vercel:
    'An AI Gateway key from your Vercel dashboard. It covers image descriptions too, and Vercel accounts come with some free monthly credit.',
  typesafe:
    'Straight from the people who make the classifier. It cannot describe images, so those use your OpenRouter or Vercel key if you have saved one.',
};

export function GeneralPanel({
  settings,
  update,
  tab,
  busy,
  bytes,
  onBrowse,
  onTest,
  onClearCache,
}: Props) {
  const openrouter = settings.provider === 'openrouter';
  const classifier = usesClassifier(settings);
  const source = classifierProviders[settings.classifierProvider];

  if (tab === 'appearance') {
    return (
      <div class="panel">
        <section class="group">
          <h2>Motion</h2>
          <Field label="Reduce motion">
            <select
              value={settings.motion}
              onChange={(event) =>
                update('motion', event.currentTarget.value as typeof settings.motion)
              }
            >
              <option value="auto">Match my device</option>
              <option value="reduced">Yes</option>
              <option value="full">No</option>
            </select>
          </Field>
          <p class="note tight">
            Covers this window and the loading placeholders Sharp draws on a page.
          </p>
        </section>
      </div>
    );
  }

  if (tab === 'about') {
    return (
      <div class="panel">
        <section class="group">
          <a
            class="support"
            href="https://github.com/tshmieldev/sharp"
            target="_blank"
            rel="noreferrer noopener"
          >
            <GitHub />
            <span>
              <b>Star it on GitHub</b>
              <small>
                Source, issues and releases.
                <br />A star is how other people find it.
              </small>
            </span>
            <Star />
          </a>
          <a
            class="support"
            href="https://ko-fi.com/tshmieldev"
            target="_blank"
            rel="noreferrer noopener"
          >
            <Coffee />
            <span>
              <b>Buy me a coffee</b>
              <small>
                Sharp is free, has no account and sends nothing anywhere but your own provider.
              </small>
            </span>
            <External />
          </a>
        </section>

        <p class="note">Build {fmt.buildTime(buildId)}</p>
      </div>
    );
  }

  if (tab === 'advanced') {
    return (
      <div class="panel">
        {openrouter && !classifier && (
          <section class="group">
            <h2>Routing</h2>
            {settings.routingProvider ? (
              <>
                <div class="tokens">
                  <span class="token accent">
                    <span>{settings.routingProvider}</span>
                    <button
                      type="button"
                      aria-label="Unpin this provider"
                      onClick={() => update('routingProvider', '')}
                    >
                      <Close />
                    </button>
                  </span>
                </div>
                <p class="note tight">
                  Every request goes to this endpoint. Unpin it to let OpenRouter choose.
                </p>
              </>
            ) : (
              <>
                <Segmented
                  label="Automatic routing preference"
                  value={settings.routingSort}
                  onChange={(value) => update('routingSort', value)}
                  options={[
                    { value: 'throughput', label: 'Throughput' },
                    { value: 'latency', label: 'Latency' },
                    { value: 'price', label: 'Price' },
                  ]}
                />
                <p class="note tight">OpenRouter picks an endpoint per request using this order.</p>
              </>
            )}
            <div class="actions">
              <button type="button" class="btn small" onClick={() => onBrowse('providers')}>
                {settings.routingProvider ? 'Change provider' : 'Compare providers'}
              </button>
            </div>
          </section>
        )}

        <section class="group">
          <h2>Debug</h2>
          <ToggleRow
            label="Debug mode"
            hint="Every judged post gets a chip. Open it to see exactly what was sent, what came back and how long each step took."
            checked={settings.debug}
            onChange={(value) => update('debug', value)}
          />
        </section>

        <section class="group">
          <h2>Maintenance</h2>
          <div class="actions">
            <button type="button" class="btn" disabled={busy} onClick={onClearCache}>
              Clear verdicts · {fmt.kilobytes(bytes)}
            </button>
          </div>
          <p class="note tight">
            Clearing verdicts re-checks every visible post, which costs again.
          </p>
        </section>
      </div>
    );
  }

  const classifierSection = (
    <section class="group">
      <h2>Classifier {classifier && <span class="badge">Used on X</span>}</h2>
      <Field label="Get it through">
        <select
          value={settings.classifierProvider}
          onChange={(event) =>
            update('classifierProvider', event.currentTarget.value as ClassifierProvider)
          }
        >
          {Object.entries(classifierProviders).map(([value, entry]) => (
            <option key={value} value={value}>
              {entry.label}
            </option>
          ))}
        </select>
      </Field>
      <KeyField
        key={settings.classifierProvider}
        id={settings.classifierProvider}
        label={source.label}
        settings={settings}
        update={update}
      />
      <p class="note tight">
        {classifierNotes[settings.classifierProvider]}{' '}
        <a href={source.keys} target="_blank" rel="noreferrer noopener">
          Get a key
        </a>
        {settings.analyzeImages && !visionProvider(settings)
          ? ' No OpenRouter or Vercel key is saved, so images are skipped for now.'
          : ''}
      </p>
      <Field label="Decision model" hint="Fixed. The classifier mode is built around it.">
        <input value={source.model} disabled spellcheck={false} />
      </Field>
      <div class="actions">
        <button type="button" class="btn" disabled={busy} onClick={() => onTest('classifier')}>
          Test the classifier
        </button>
      </div>
      <p class="note tight">Save first. Testing makes one small billable request.</p>
    </section>
  );
  const chatSection = (
    <section class="group">
      <h2>Language model {!classifier && <span class="badge">Used on X</span>}</h2>
      <Field label="Provider">
        <select
          value={settings.provider}
          onChange={(event) => update('provider', event.currentTarget.value as Provider)}
        >
          {Object.entries(providers).map(([value, entry]) => (
            <option key={value} value={value}>
              {entry.label}
            </option>
          ))}
        </select>
      </Field>
      {settings.provider === 'custom' ? (
        <Field
          label="HTTPS base URL"
          hint="Include /v1 if the endpoint requires it. Your browser asks for permission on save."
        >
          <input
            type="url"
            placeholder="https://example.com/v1"
            value={settings.customBaseUrl}
            onInput={(event) => update('customBaseUrl', event.currentTarget.value)}
          />
        </Field>
      ) : null}
      <KeyField
        key={settings.provider}
        id={settings.provider}
        label={providers[settings.provider].label}
        settings={settings}
        update={update}
      />
      <button type="button" class="model-card" onClick={() => onBrowse('models')}>
        <div>
          <span class="id">{settings.model || 'No model selected'}</span>
          <span class="meta">
            {openrouter
              ? 'Browse OpenRouter models'
              : `Browse ${providers[settings.provider].label} models`}
          </span>
        </div>
        <ChevronRight />
      </button>
      <Field label="Or type a model ID">
        <input
          value={settings.model}
          spellcheck={false}
          placeholder="vendor/model"
          onInput={(event) => update('model', event.currentTarget.value.trim())}
        />
      </Field>
      <div class="actions">
        <button type="button" class="btn" disabled={busy} onClick={() => onTest('llm')}>
          Test the language model
        </button>
      </div>
      <p class="note tight">Save first. Testing makes one small billable request.</p>
    </section>
  );

  return (
    <div class="panel">
      <p class="note">
        Two ways to judge a post, each with a key of its own. Pick which one X uses under X ›
        Advanced.
      </p>

      {/* The one X uses comes first. */}
      {classifier ? classifierSection : chatSection}
      {classifier ? chatSection : classifierSection}
    </div>
  );
}
