import { isWireMessage } from './wire-extract';

// Sends X's own "Not interested" request, the same one its menu sends, with
// the metadata and headers the page-world hook read off the wire. No menu is
// opened and X draws no card, so the hidden post's cell never changes hands.
const FEEDBACK_PATH = '/i/api/2/timeline/feedback.json';
const MAX_METADATA = 3000;

const cookie = (name: string) =>
  document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? '';

export class Feedback {
  private metadata = new Map<string, string>();
  private headers: Record<string, string> | null = null;
  private listening = false;

  private readonly onMessage = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data: unknown = event.data;
    if (!isWireMessage(data)) return;
    if (data.kind === 'headers') {
      this.headers = data.headers;
      return;
    }
    for (const entry of data.entries) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string' || typeof entry[1] !== 'string')
        continue;
      this.metadata.delete(entry[0]);
      this.metadata.set(entry[0], entry[1]);
    }
    while (this.metadata.size > MAX_METADATA) {
      const oldest = this.metadata.keys().next().value;
      if (oldest === undefined) break;
      this.metadata.delete(oldest);
    }
  };

  start() {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('message', this.onMessage);
  }

  stop() {
    if (this.listening) window.removeEventListener('message', this.onMessage);
    this.listening = false;
  }

  /** Whether this post can be reported without touching the page. */
  ready(id: string): boolean {
    return this.metadata.has(id) && this.headers !== null;
  }

  /** Resolves true only on X's acknowledgement. Never throws. */
  async send(id: string, undo = false): Promise<boolean> {
    const metadata = this.metadata.get(id);
    if (!metadata || !this.headers) return false;
    const csrf = this.headers['x-csrf-token'] || cookie('ct0');
    if (!csrf) return false;
    const url = new URL(FEEDBACK_PATH, location.origin);
    url.searchParams.set('feedback_type', 'DontLike');
    url.searchParams.set('action_metadata', metadata);
    try {
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...this.headers,
          'x-csrf-token': csrf,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: `feedback_type=DontLike&undo=${undo ? 'true' : 'false'}`,
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
