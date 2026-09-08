import type { PublicSettings } from '../common/settings';
import { wordMatcher } from '../common/post';

export type LocalDecision = 'show' | 'ai' | 'Blocked author' | 'Blocked word in post';
export function createRules(settings: PublicSettings) {
  const allowed = new Set(settings.allowedAuthors.map((name) => name.toLowerCase()));
  const blocked = new Set(settings.blockedAuthors.map((name) => name.toLowerCase()));
  const words = wordMatcher(settings.blockedWords);
  return (
    post: { handle: string; text: string },
    reposter: string,
    thread: string,
    context: boolean,
    path: string,
  ): LocalDecision => {
    const actors = [post.handle, reposter].filter(Boolean).map((name) => name.toLowerCase());
    if (
      !settings.enabled ||
      context ||
      settings.bypassedThreads.includes(thread) ||
      /^\/(i\/bookmarks|bookmarks|notifications|messages|settings)(?:\/|$)/.test(path) ||
      actors.some((actor) => allowed.has(actor))
    )
      return 'show';
    if (actors.some((actor) => blocked.has(actor))) return 'Blocked author';
    if (words?.test(post.text)) return 'Blocked word in post';
    return settings.configured ? 'ai' : 'show';
  };
}
