import { isWireMessage } from './wire-extract';

// Sends X's own "Not interested" request, the same one its menu sends, with
// the metadata and headers the page-world hook read off the wire. No menu is
// opened and X draws no card, so the hidden post's cell never changes hands.
const FEEDBACK_PATH = '/i/api/2/timeline/feedback.json';
const MAX_METADATA = 3000;
// Entry orders of recent timeline responses, newest first.
const MAX_ORDERS = 12;

const cookie = (name: string) =>
  document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? '';

export class Feedback {
  private metadata = new Map<string, string>();
  private orders: string[][] = [];
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
    this.observe(
      data.entries.filter(
        (entry): entry is [string, string] =>
          Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string',
      ),
    );
  };

  /** One timeline response: metadata per post, and the order the posts came in. */
  observe(entries: [id: string, metadata: string][]) {
    if (!entries.length) return;
    for (const [id, metadata] of entries) {
      this.metadata.delete(id);
      this.metadata.set(id, metadata);
    }
    this.orders.unshift(entries.map(([id]) => id));
    this.orders.length = Math.min(this.orders.length, MAX_ORDERS);
    while (this.metadata.size > MAX_METADATA) {
      const oldest = this.metadata.keys().next().value;
      if (oldest === undefined) break;
      this.metadata.delete(oldest);
    }
  }

  /** The posts the wire placed between two neighbours, newest response first.
   *  Either neighbour may be unknown; then the run is open on that side. */
  between(previous: string, next: string): string[] {
    for (const order of this.orders) {
      const start = previous ? order.indexOf(previous) : -1;
      const end = next ? order.indexOf(next) : -1;
      if (previous && start < 0) continue;
      if (next && end < 0) continue;
      if (!previous && !next) continue;
      if (start >= 0 && end >= 0) return start < end ? order.slice(start + 1, end) : [];
      return start >= 0 ? order.slice(start + 1) : order.slice(0, end);
    }
    return [];
  }

  /** The given posts in the order the wire last placed them. Posts the wire
   *  never saw are dropped: without an order they cannot be told apart. */
  rank(ids: readonly string[]): string[] {
    const position = new Map<string, number>();
    // Newest response first; an earlier response only adds posts it alone knew.
    let base = 0;
    for (const order of this.orders) {
      for (const [index, id] of order.entries()) {
        if (!position.has(id)) position.set(id, base + index);
      }
      base += order.length;
    }
    return ids
      .filter((id) => position.has(id))
      .sort((a, b) => (position.get(a) ?? 0) - (position.get(b) ?? 0));
  }

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
