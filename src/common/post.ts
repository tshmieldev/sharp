import { Schema } from 'effect';

export const Post = Schema.Struct({
  key: Schema.String.pipe(Schema.maxLength(300)),
  handle: Schema.String.pipe(Schema.maxLength(30)),
  text: Schema.String.pipe(Schema.maxLength(30000)),
  images: Schema.Array(Schema.String.pipe(Schema.maxLength(2000))).pipe(Schema.maxItems(4)),
  context: Schema.String.pipe(Schema.maxLength(1000)),
});
export type Post = typeof Post.Type;
/** Debug mode only: what one image became before a classifier saw it. */
export const TraceImage = Schema.Struct({
  url: Schema.String,
  model: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  ms: Schema.optional(Schema.Number),
  cached: Schema.optional(Schema.Boolean),
  failed: Schema.optional(Schema.Boolean),
  /** The text alone settled it, so the image was never described. */
  skipped: Schema.optional(Schema.Boolean),
});
export type TraceImage = typeof TraceImage.Type;
/** Debug mode only: everything behind one decision. Never cached, never sent
 *  anywhere; it rides back with the verdict to the tab that asked. */
export const Trace = Schema.Struct({
  source: Schema.Literal('classifier', 'llm', 'cache'),
  model: Schema.String,
  /** When the decision was made. */
  at: Schema.Number,
  totalMs: Schema.optional(Schema.Number),
  requestMs: Schema.optional(Schema.Number),
  /** Posts decided in the same request. */
  batch: Schema.optional(Schema.Number),
  tokens: Schema.optional(Schema.Number),
  images: Schema.Array(TraceImage),
  /** The text-only decision that sent a post on to its images. The final
   *  request, response and requestMs are the second decision's. */
  textPass: Schema.optional(
    Schema.Struct({
      score: Schema.Number,
      ms: Schema.Number,
      request: Schema.Unknown,
      response: Schema.Unknown,
    }),
  ),
  request: Schema.optional(Schema.Unknown),
  response: Schema.optional(Schema.Unknown),
});
export type Trace = typeof Trace.Type;

export const Verdict = Schema.Struct({
  key: Schema.String,
  hide: Schema.Boolean,
  reason: Schema.String,
  /** The model hid it but called it a close one. */
  unsure: Schema.optional(Schema.Boolean),
  /** A classifier's probability that the post should be hidden. When present,
   *  a close call is read from it against the reader's current threshold. */
  score: Schema.optional(Schema.Number),
  trace: Schema.optional(Trace),
  failed: Schema.optional(Schema.Boolean),
});
export type Verdict = typeof Verdict.Type;

export function threadId(path: string): string {
  return /^\/[^/]+\/status\/(\d+)(?:\/|$)/.exec(path)?.[1] ?? '';
}

export function wordMatcher(words: readonly string[]): RegExp | null {
  const pattern = words
    .map((word) => word.trim())
    .filter(Boolean)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return pattern
    ? new RegExp(`(?:^|[^\\p{L}\\p{N}_])(?:${pattern})(?:[^\\p{L}\\p{N}_]|$)`, 'iu')
    : null;
}
