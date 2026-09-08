import { useEffect } from 'preact/hooks';
import { Close } from './icons';
import { TokenList, type SettingsEditor } from './ui';

export type ListKey = 'allowedAuthors' | 'blockedAuthors' | 'blockedWords';

export const lists: Record<
  ListKey,
  {
    title: string;
    summary: string;
    hint: string;
    placeholder: string;
    prefix: string;
    empty: string;
  }
> = {
  allowedAuthors: {
    title: 'Never filter',
    summary: 'author',
    hint: 'These authors always come through, reposts included, and no blocked word can hide them.',
    placeholder: 'handle',
    prefix: '@',
    empty: 'No exempt authors yet.',
  },
  blockedAuthors: {
    title: 'Always hide',
    summary: 'author',
    hint: 'Hidden before the model is asked, so these authors never cost you a request.',
    placeholder: 'handle',
    prefix: '@',
    empty: 'No blocked authors yet.',
  },
  blockedWords: {
    title: 'Blocked words',
    summary: 'word',
    hint: 'Matched as whole words anywhere in a post, before the model is asked.',
    placeholder: 'word or phrase',
    prefix: '',
    empty: 'No blocked words yet.',
  },
};

export function ListSheet({
  settings,
  update,
  list,
  onClose,
}: SettingsEditor & { list: ListKey; onClose: () => void }) {
  const meta = lists[list];
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);

  return (
    <div
      class="sheet"
      style="grid-template-rows:auto minmax(0,1fr)"
      role="dialog"
      aria-modal="true"
      aria-label={meta.title}
    >
      <div class="sheet-head">
        <h2>
          {meta.title}
          <span class="sub">{meta.hint}</span>
        </h2>
        <button type="button" class="btn icon" aria-label="Close" onClick={onClose}>
          <Close />
        </button>
      </div>
      <div class="sheet-list" style="padding:12px">
        <TokenList
          values={settings[list]}
          onChange={(values) => update(list, values)}
          placeholder={meta.placeholder}
          prefix={meta.prefix}
          empty={meta.empty}
        />
      </div>
    </div>
  );
}
