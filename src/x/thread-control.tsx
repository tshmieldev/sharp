import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { request } from '../common/messages';
import type { PublicSettings } from '../common/settings';
import { articleSelector, currentThread, focalArticle } from './extract';
import { visible } from './post-menu-dom';
import { Check, Mark } from './icons';
import { typeface } from './view';

/** Find the inline reply section, never a modal composer or a timeline's post box. */
export function replySection(id: string): HTMLElement | null {
  const focal = focalArticle(id);
  const column = focal?.closest('[data-testid="primaryColumn"]');
  if (!focal || !column) return null;
  const candidates: HTMLElement[] = [];
  for (const editor of column.querySelectorAll<HTMLElement>('[data-testid="tweetTextarea_0"]')) {
    if (editor.closest('[role="dialog"], article') || !visible(editor)) continue;
    if (!(focal.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    // The editor and inline submit button identify the section without relying
    // on translated placeholder text or generated X class names.
    let section: HTMLElement | null = editor.parentElement;
    while (
      section &&
      section !== column &&
      !section.querySelector('[data-testid="tweetButtonInline"]')
    ) {
      section = section.parentElement;
    }
    if (!section || section === column || section.querySelector(articleSelector)) continue;
    // Include the avatar/outer reply row, but never move above the focal post.
    while (
      section.parentElement &&
      section.parentElement !== column &&
      !section.parentElement.matches('[data-testid="cellInnerDiv"]') &&
      !section.parentElement.querySelector(articleSelector)
    ) {
      section = section.parentElement;
    }
    // Keep the control inside a virtualized cell so X can measure its height.
    if (section.matches('[data-testid="cellInnerDiv"]')) {
      section =
        [...section.children].find(
          (child): child is HTMLElement =>
            child instanceof HTMLElement && !child.matches('.aitf-thread-control'),
        ) ?? null;
    }
    if (!section) continue;
    if (!candidates.includes(section)) candidates.push(section);
  }
  return candidates.length === 1 ? candidates[0]! : null;
}

type Props = {
  id: string;
  bypassed: boolean;
  send: typeof request;
  isCurrent: () => boolean;
};

function ThreadButton({ id, bypassed, send, isCurrent }: Props) {
  const [active, setActive] = useState(bypassed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  useEffect(() => setActive(bypassed), [bypassed]);

  async function save() {
    if (saving.current || !isCurrent()) return;
    saving.current = true;
    setBusy(true);
    setError('');
    const next = !active;
    try {
      await send({ type: 'SET_THREAD_BYPASS', threadId: id, bypassed: next });
      if (isCurrent()) setActive(next);
    } catch {
      if (isCurrent()) setError('Could not save. Try again or reload the extension.');
    } finally {
      saving.current = false;
      if (isCurrent()) setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        class="aitf-pill"
        data-active={active ? 'true' : 'false'}
        disabled={busy}
        onClick={() => void save()}
      >
        {active ? <Check /> : <Mark />}
        <span>
          {active ? 'Filter comments in this thread' : 'Show all comments in this thread'}
        </span>
      </button>
      {active && !error && (
        <p class="aitf-thread-note">
          Every reply this extension would hide is showing. X's own reply limits still apply.
        </p>
      )}
      {error && (
        <p class="aitf-thread-note" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/** Reuses the timeline controller's scans and settings subscription; no new polling. */
export class ThreadControl {
  private root: HTMLElement | null = null;
  private section: HTMLElement | null = null;
  private path = '';
  private bypassed: boolean | null = null;

  constructor(private readonly send: typeof request = request) {}

  update(settings: PublicSettings) {
    const id = currentThread();
    const section = id ? replySection(id) : null;
    if (!section) {
      this.dispose();
      return;
    }
    if (
      this.path !== location.pathname ||
      this.section !== section ||
      !this.root?.isConnected ||
      this.root.nextElementSibling !== section
    ) {
      this.dispose();
      this.path = location.pathname;
      this.section = section;
      this.root = document.createElement('div');
      this.root.className = 'aitf-thread-control';
      // Mounted outside a post, so X's face has to be sampled rather than inherited.
      const family = typeface(focalArticle(id) ?? section);
      if (family) this.root.style.fontFamily = family;
      section.before(this.root);
    }
    const bypassed = settings.bypassedThreads.includes(id);
    if (this.bypassed === bypassed) return;
    this.bypassed = bypassed;
    const root = this.root!;
    const path = this.path;
    render(
      <ThreadButton
        id={id}
        bypassed={bypassed}
        send={this.send}
        isCurrent={() => this.root === root && root.isConnected && path === location.pathname}
      />,
      root,
    );
  }

  dispose() {
    if (this.root) {
      render(null, this.root);
      this.root.remove();
    }
    this.root = null;
    this.section = null;
    this.bypassed = null;
    this.path = '';
  }
}
