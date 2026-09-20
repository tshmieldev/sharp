// Pure readers for what X puts on the wire. No DOM, no chrome.*: this runs in
// the page's own world and in tests.

const entryPattern = /tweet-(\d+)$/;

/** Every post in a timeline response arrives with the exact `action_metadata`
 *  blob X's own client sends back with "Not interested". Sharp echoes it
 *  rather than encoding it. */
export function feedbackMetadata(json: unknown): [id: string, metadata: string][] {
  const found: [string, string][] = [];
  const seen = new Set<string>();
  const walk = (node: unknown, entryId: string, depth: number) => {
    if (depth > 40 || typeof node !== 'object' || node === null) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, entryId, depth + 1);
      return;
    }
    const record = node as Record<string, unknown>;
    if (typeof record.entryId === 'string') entryId = record.entryId;
    const info = record.feedbackInfo;
    const metadata =
      typeof info === 'object' && info !== null
        ? (info as Record<string, unknown>).feedbackMetadata
        : undefined;
    const id = entryPattern.exec(entryId)?.[1];
    if (typeof metadata === 'string' && metadata && id && !seen.has(id)) {
      seen.add(id);
      found.push([id, metadata]);
    }
    for (const value of Object.values(record)) walk(value, entryId, depth + 1);
  };
  walk(json, '', 0);
  return found;
}

/** The headers X's client signs its API calls with. Reused verbatim. */
export const signingHeaders = [
  'authorization',
  'x-csrf-token',
  'x-client-transaction-id',
  'x-twitter-auth-type',
  'x-twitter-active-user',
  'x-twitter-client-language',
] as const;

export function pickSigning(headers: Headers): Record<string, string> | null {
  const picked: Record<string, string> = {};
  for (const name of signingHeaders) {
    const value = headers.get(name);
    if (value) picked[name] = value;
  }
  return picked.authorization && picked['x-csrf-token'] ? picked : null;
}

/** The content script's word on whether anything here is wanted: only "Teach X
 *  too" uses it. The page script cannot read settings itself. */
export type WireSwitch = { aitf: 'wire'; kind: 'switch'; on: boolean };
export const isWireSwitch = (data: unknown): data is WireSwitch =>
  typeof data === 'object' &&
  data !== null &&
  (data as { aitf?: unknown }).aitf === 'wire' &&
  (data as { kind?: unknown }).kind === 'switch' &&
  typeof (data as { on?: unknown }).on === 'boolean';

/** Nothing is passed on until the content script says the feature is on. The
 *  page script starts before settings can be read, and X's first timeline
 *  response comes early, so until the word arrives a few messages are held
 *  back rather than sent or lost. Off drops them and stops the reading itself. */
export function createGate(post: (message: WireMessage) => void, limit = 20) {
  let state: 'unknown' | 'on' | 'off' = 'unknown';
  let held: WireMessage[] = [];
  return {
    /** Whether there is any point looking at a request at all. */
    get reading() {
      return state !== 'off';
    },
    send(message: WireMessage) {
      if (state === 'on') post(message);
      else if (state === 'unknown') held = [...held, message].slice(-limit);
    },
    set(on: boolean) {
      state = on ? 'on' : 'off';
      if (on) for (const message of held) post(message);
      held = [];
    },
  };
}

export type WireMessage =
  | { aitf: 'wire'; kind: 'metadata'; entries: [string, string][] }
  | { aitf: 'wire'; kind: 'headers'; headers: Record<string, string> };

export const isWireMessage = (data: unknown): data is WireMessage =>
  typeof data === 'object' &&
  data !== null &&
  (data as { aitf?: unknown }).aitf === 'wire' &&
  ((data as { kind?: unknown }).kind === 'metadata' ||
    (data as { kind?: unknown }).kind === 'headers');
