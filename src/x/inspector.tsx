// Debug mode's inspector: everything behind one decision, beside the timeline.
// It is non-modal on purpose. The reader keeps scrolling, opens the next post's
// chip, and the panel swaps; nothing on the page is blocked or dimmed.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Post, Trace, Verdict } from '../common/post';
import { percent, sureText, typeface } from './view';
import { Check, Close, Copy } from './icons';

export type Inspection = {
  post: Post;
  name: string;
  verdict: Verdict;
  threshold: number;
  hideFrom: number;
  unsure: boolean;
};

let host: HTMLElement | null = null;

const ms = (value: number | undefined) =>
  value === undefined
    ? '—'
    : value < 1000
      ? `${Math.round(value)} ms`
      : `${(value / 1000).toFixed(2)} s`;
const clock = (at: number) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

/** X paints its theme on <body>; the panel takes the same ground and ink. */
function theme(panel: HTMLElement) {
  const body = getComputedStyle(document.body);
  const ground = body.backgroundColor;
  panel.style.setProperty(
    '--aitf-ground',
    ground && ground !== 'rgba(0, 0, 0, 0)' ? ground : 'Canvas',
  );
  panel.style.setProperty('--aitf-ink', body.color || 'CanvasText');
  const family = typeface(document.body);
  if (family) panel.style.fontFamily = family;
}

function verdictLine({ verdict, unsure }: Inspection) {
  if (verdict.reason === 'Your correction') return 'Hidden by your correction';
  if (!verdict.hide) return 'Kept';
  return unsure ? 'Hidden · close call' : 'Hidden';
}

/** What the number means for this post, against the lines it was held to. */
function scoreLine({ verdict, unsure, threshold, hideFrom }: Inspection) {
  if (!verdict.hide) return `Under your ${percent(hideFrom)} hide line, so it stays.`;
  if (verdict.reason === 'Your correction') return 'You overruled the model on this one.';
  return unsure
    ? `Under your ${percent(threshold)} line: hidden as a close call, not reported to X.`
    : `At or over your ${percent(threshold)} line, so it is hidden.`;
}

function CopyButton({ value }: { value: unknown }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      class="aitf-copy"
      onClick={() => {
        void navigator.clipboard.writeText(JSON.stringify(value, null, 2)).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        });
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function Payload({ title, value }: { title: string; value: unknown }) {
  if (value === undefined) return null;
  return (
    <details class="aitf-payload" open>
      <summary>
        <span>{title}</span>
        <CopyButton value={value} />
      </summary>
      <pre>
        <code>{JSON.stringify(value, null, 2)}</code>
      </pre>
    </details>
  );
}

/** The text is asked first; where that was not enough, images are described
 *  side by side and the classifier is asked again. The bars sit on one clock,
 *  so a slow image and a slow decision look different at a glance. */
function Waterfall({ trace }: { trace: Trace }) {
  const textMs = trace.textPass?.ms ?? 0;
  const images = trace.images.filter((image) => image.ms !== undefined);
  const imagesEnd = images.reduce((end, image) => Math.max(end, textMs + (image.ms ?? 0)), textMs);
  const total = Math.max(trace.totalMs ?? 0, imagesEnd + (trace.requestMs ?? 0), 1);
  const bar = (start: number, length: number) => ({
    insetInlineStart: `${(start / total) * 100}%`,
    inlineSize: `max(2px, ${(length / total) * 100}%)`,
  });
  return (
    <ol class="aitf-waterfall">
      {trace.textPass && (
        <li>
          <span class="aitf-lane">
            Text only<em>{percent(trace.textPass.score)}</em>
          </span>
          <span class="aitf-track">
            <i data-kind="decision" style={bar(0, textMs)} />
          </span>
          <span class="aitf-ms">{ms(textMs)}</span>
        </li>
      )}
      {images.map((image, index) => (
        <li key={image.url}>
          <span class="aitf-lane">
            Image {index + 1}
            {image.cached ? <em>cached</em> : image.failed ? <em>failed</em> : null}
          </span>
          <span class="aitf-track">
            <i data-kind="image" style={bar(textMs, image.ms ?? 0)} />
          </span>
          <span class="aitf-ms">{ms(image.ms)}</span>
        </li>
      ))}
      {trace.requestMs !== undefined && (
        <li>
          <span class="aitf-lane">
            {trace.textPass ? 'With images' : 'Decision'}
            {trace.batch && trace.batch > 1 ? <em>{trace.batch} posts</em> : null}
          </span>
          <span class="aitf-track">
            <i data-kind="decision" style={bar(imagesEnd, trace.requestMs)} />
          </span>
          <span class="aitf-ms">{ms(trace.requestMs)}</span>
        </li>
      )}
      <li class="aitf-total">
        <span class="aitf-lane">Total</span>
        <span class="aitf-track" />
        <span class="aitf-ms">{ms(trace.totalMs)}</span>
      </li>
    </ol>
  );
}

function Panel({ entry, onClose }: { entry: Inspection; onClose: () => void }) {
  const { verdict, post, hideFrom } = entry;
  const trace = verdict.trace;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside class="aitf-inspector" aria-label="Decision inspector">
      <header class="aitf-inspector-head">
        <div class="aitf-verdict">
          <strong>{verdictLine(entry)}</strong>
          {verdict.score !== undefined ? (
            <div class="aitf-verdict-score">
              <p class="aitf-verdict-likely">
                {sureText(verdict.score, entry.unsure, hideFrom)}
                {!verdict.hide && <span>scored {percent(verdict.score)}</span>}
              </p>
              <p class="aitf-quiet">{scoreLine(entry)}</p>
            </div>
          ) : verdict.hide ? (
            <p class="aitf-quiet">“{verdict.reason}”</p>
          ) : null}
        </div>
        <button type="button" class="aitf-close" aria-label="Close inspector" onClick={onClose}>
          <Close />
        </button>
      </header>

      <div class="aitf-inspector-body">
        <section class="aitf-post-excerpt">
          <b>{entry.name || `@${post.handle}`}</b>
          <span>@{post.handle}</span>
          <p>{post.text || '(no text)'}</p>
        </section>

        {!trace ? (
          <p class="aitf-quiet">
            No trace for this post. It was decided before debug mode was on; clear verdicts to
            decide it again.
          </p>
        ) : trace.source === 'cache' ? (
          <section>
            <h3>From cache</h3>
            <p class="aitf-quiet">
              Decided at {clock(trace.at)} and remembered, so no request was made this time. Clear
              verdicts to see a fresh decision.
            </p>
          </section>
        ) : (
          <>
            <dl class="aitf-facts">
              <div>
                <dt>Decided by</dt>
                <dd>{trace.source === 'classifier' ? 'Classifier' : 'Language model'}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>
                  <code>{trace.model}</code>
                </dd>
              </div>
              <div>
                <dt>Tokens</dt>
                <dd>{trace.tokens?.toLocaleString() ?? '—'}</dd>
              </div>
              <div>
                <dt>At</dt>
                <dd>{clock(trace.at)}</dd>
              </div>
            </dl>

            <section>
              <h3>Timing</h3>
              <Waterfall trace={trace} />
            </section>

            {trace.images.length > 0 && (
              <section>
                <h3>Images</h3>
                <ul class="aitf-images">
                  {trace.images.map((image) => (
                    <li key={image.url}>
                      <a href={image.url} target="_blank" rel="noreferrer noopener">
                        <img src={image.url} alt="" loading="lazy" />
                      </a>
                      <div>
                        <p class="aitf-image-meta">
                          {image.skipped ? (
                            'Not described: the text settled it'
                          ) : image.model ? (
                            <code>{image.model}</code>
                          ) : (
                            'Sent as-is to the model'
                          )}
                          {image.ms !== undefined && <span>{ms(image.ms)}</span>}
                          {image.cached && <span>cached</span>}
                          {image.failed && <span>failed</span>}
                        </p>
                        {image.description !== undefined && (
                          <p class="aitf-image-text">
                            {image.description || 'No description came back.'}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {trace.textPass && (
              <>
                <Payload title="Text-only request" value={trace.textPass.request} />
                <Payload title="Text-only response" value={trace.textPass.response} />
              </>
            )}
            <Payload
              title={trace.textPass ? 'Request with images' : 'Request'}
              value={trace.request}
            />
            <Payload
              title={trace.textPass ? 'Response with images' : 'Response'}
              value={trace.response}
            />
          </>
        )}
      </div>
    </aside>
  );
}

export function closeInspector() {
  if (!host) return;
  render(null, host);
  host.remove();
  host = null;
}

export function openInspector(entry: Inspection) {
  if (!host?.isConnected) {
    host = document.createElement('div');
    host.className = 'aitf-inspector-host';
    document.body.append(host);
  }
  theme(host);
  render(<Panel entry={entry} onClose={closeInspector} />, host);
}
