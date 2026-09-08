import { useState } from 'preact/hooks';
import { providers, type Provider } from '../common/settings';
import { buildId } from '../common/build';
import * as fmt from './format';
import { Check, ChevronRight, Close, Coffee, External, Eye, EyeOff, GitHub, Star } from './icons';
import { Field, NumberField, Segmented, type SettingsEditor } from './ui';

export type GeneralTab = 'connection' | 'appearance' | 'about';

type Props = SettingsEditor & {
  tab: GeneralTab;
  busy: boolean;
  bytes: number;
  onBrowse: (view: 'models' | 'providers') => void;
  onTest: () => void;
  onClearCache: () => void;
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
  const [revealKey, setRevealKey] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const key = settings.apiKeys[settings.provider] ?? '';
  const openrouter = settings.provider === 'openrouter';

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
          <p class="note tight">
            Either way the reason stays visible and one click reveals the post.
          </p>
        </section>

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
            href="https://github.com/tshmielash"
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

  return (
    <div class="panel">
      <section class="group">
        <h2>Provider</h2>
        <select
          aria-label="Provider"
          value={settings.provider}
          onChange={(event) => {
            update('provider', event.currentTarget.value as Provider);
            setReplacing(false);
          }}
        >
          {Object.entries(providers).map(([value, entry]) => (
            <option key={value} value={value}>
              {entry.label}
            </option>
          ))}
        </select>
        {settings.provider === 'custom' ? (
          <Field
            label="HTTPS base URL"
            hint="Include /v1 if the endpoint requires it. Chrome asks for permission on save."
          >
            <input
              type="url"
              placeholder="https://example.com/v1"
              value={settings.customBaseUrl}
              onInput={(event) => update('customBaseUrl', event.currentTarget.value)}
            />
          </Field>
        ) : null}
        {key && !replacing ? (
          <div class="status-row">
            <Check />
            <span class="value">{`···· ${key.slice(-4)}`}</span>
            <button type="button" class="btn quiet small" onClick={() => setReplacing(true)}>
              Replace key
            </button>
          </div>
        ) : (
          <>
            <div class="key">
              <input
                type={revealKey ? 'text' : 'password'}
                autoComplete="off"
                spellcheck={false}
                placeholder={`Paste your ${providers[settings.provider].label} key`}
                value={key}
                onInput={(event) =>
                  update('apiKeys', {
                    ...settings.apiKeys,
                    [settings.provider]: event.currentTarget.value.trim(),
                  })
                }
              />
              <button
                type="button"
                class="btn icon"
                aria-label={revealKey ? 'Hide the API key' : 'Show the API key'}
                onClick={() => setRevealKey(!revealKey)}
              >
                {revealKey ? <EyeOff /> : <Eye />}
              </button>
            </div>
            <p class="note tight">
              {key
                ? 'Stored locally in this browser, never synced.'
                : 'Stored locally in this browser. Nothing is filtered until you save one.'}
            </p>
          </>
        )}
      </section>

      <section class="group">
        <h2>Model</h2>
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
      </section>

      {openrouter && (
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
        <h2>Maintenance</h2>
        <div class="actions">
          <button type="button" class="btn" disabled={busy} onClick={onTest}>
            Test connection
          </button>
          <button type="button" class="btn" disabled={busy} onClick={onClearCache}>
            Clear verdicts · {fmt.kilobytes(bytes)}
          </button>
        </div>
        <p class="note tight">
          Testing makes one billable request. Clearing verdicts re-checks every visible post, which
          costs again.
        </p>
      </section>

      <details class="group">
        <summary class="note">Batch limits</summary>
        {(
          [
            ['batchSize', 'Posts per request', 30],
            ['imageBatchSize', 'Posts per request with images', 10],
            ['maxImagesPerPost', 'Images per post', 4],
          ] as const
        ).map(([field, label, max]) => (
          <NumberField
            key={field}
            label={label}
            min={1}
            max={max}
            value={settings[field]}
            onChange={(next) => update(field, next)}
          />
        ))}
      </details>
    </div>
  );
}
