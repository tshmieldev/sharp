import { Schema } from 'effect';
import type { Settings } from './settings';

export const AuthorRule = Schema.Literal('allow', 'block', 'default');
export type AuthorRule = typeof AuthorRule.Type;
export const AuthorHandle = Schema.String.pipe(Schema.pattern(/^[A-Za-z0-9_]{1,15}$/));
type AuthorLists = Pick<Settings, 'allowedAuthors' | 'blockedAuthors'>;

export function authorRule(settings: AuthorLists, handle: string): AuthorRule {
  const matches = (entry: string) => entry.toLowerCase() === handle.toLowerCase();
  if (settings.allowedAuthors.some(matches)) return 'allow';
  return settings.blockedAuthors.some(matches) ? 'block' : 'default';
}

/** Replace the author's rule, rather than toggling a potentially stale UI snapshot. */
export function withAuthorRule(
  settings: AuthorLists,
  handle: string,
  rule: AuthorRule,
): AuthorLists {
  const without = (values: readonly string[]) =>
    values.filter((entry) => entry.toLowerCase() !== handle.toLowerCase());
  const allowedAuthors = without(settings.allowedAuthors);
  const blockedAuthors = without(settings.blockedAuthors);
  if (rule === 'allow') allowedAuthors.push(handle);
  if (rule === 'block') blockedAuthors.push(handle);
  return { allowedAuthors: allowedAuthors.slice(-500), blockedAuthors: blockedAuthors.slice(-500) };
}
