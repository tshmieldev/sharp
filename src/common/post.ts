import { Schema } from 'effect';

export const Post = Schema.Struct({
  key: Schema.String.pipe(Schema.maxLength(300)),
  handle: Schema.String.pipe(Schema.maxLength(30)),
  text: Schema.String.pipe(Schema.maxLength(30000)),
  images: Schema.Array(Schema.String.pipe(Schema.maxLength(2000))).pipe(Schema.maxItems(4)),
  context: Schema.String.pipe(Schema.maxLength(1000)),
});
export type Post = typeof Post.Type;
export const Verdict = Schema.Struct({
  key: Schema.String,
  hide: Schema.Boolean,
  reason: Schema.String,
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
