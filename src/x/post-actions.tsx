import { render, type JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { request, type Request } from '../common/messages';
import { authorRule } from '../common/author-rules';
import type { PublicSettings } from '../common/settings';
import { Eye, EyeOff, ShieldCheck, ShieldOff } from './icons';

type Props = {
  handle: string;
  settings: PublicSettings;
  isCurrent: () => boolean;
  dismiss: () => void;
};
type MenuAction = {
  label: string;
  icon: JSX.Element;
  message: Extract<Request, { type: 'SET_AUTHOR_RULE' }>;
};

function PostActions({ handle, settings, isCurrent, dismiss }: Props) {
  const rule = authorRule(settings, handle);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const actions: MenuAction[] = [
    {
      label:
        rule === 'allow' ? `Remove filter exemption for @${handle}` : `Never filter @${handle}`,
      icon: rule === 'allow' ? <ShieldOff /> : <ShieldCheck />,
      message: { type: 'SET_AUTHOR_RULE', handle, rule: rule === 'allow' ? 'default' : 'allow' },
    },
    {
      label: rule === 'block' ? `Stop always hiding @${handle}` : `Always hide @${handle}`,
      icon: rule === 'block' ? <Eye /> : <EyeOff />,
      message: { type: 'SET_AUTHOR_RULE', handle, rule: rule === 'block' ? 'default' : 'block' },
    },
  ];

  async function save(message: MenuAction['message']) {
    // Guard synchronous repeat activation before Preact has rendered the busy state.
    if (saving.current || !isCurrent()) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await request(message);
      if (!isCurrent()) return; // A save may outlive the menu that initiated it.
      dismiss();
    } catch {
      if (isCurrent()) setError('Could not save this rule. Try again or reload the extension.');
    } finally {
      saving.current = false;
      if (isCurrent()) setBusy(false);
    }
  }

  return (
    <>
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          role="menuitem"
          tabIndex={-1}
          class="aitf-menu-action"
          aria-disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            void save(action.message);
          }}
        >
          {action.icon}
          <span>{action.label}</span>
        </button>
      ))}
      {error && (
        <div class="aitf-menu-error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}

export function mountPostActions(root: HTMLElement, props: Props) {
  render(<PostActions {...props} />, root);
  return () => render(null, root);
}
