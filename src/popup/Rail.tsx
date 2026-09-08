import type { JSX } from 'preact';
import { Bluesky, Gear, Instagram, XMark, YouTube } from './icons';

export type Section = 'x' | 'general';

const platforms: {
  id: string;
  label: string;
  Icon: (props: JSX.SVGAttributes<SVGSVGElement>) => JSX.Element;
  ready: boolean;
}[] = [
  { id: 'x', label: 'X', Icon: XMark, ready: true },
  { id: 'youtube', label: 'YouTube', Icon: YouTube, ready: false },
  { id: 'instagram', label: 'Instagram', Icon: Instagram, ready: false },
  { id: 'bluesky', label: 'Bluesky', Icon: Bluesky, ready: false },
];

export function Rail({
  section,
  onSite,
  onSelect,
}: {
  section: Section;
  onSite: boolean;
  onSelect: (section: Section) => void;
}) {
  return (
    <nav class="rail" aria-label="Sections">
      {platforms.map(({ id, label, Icon, ready }) => (
        <button
          key={id}
          type="button"
          class="rail-btn"
          disabled={!ready}
          aria-current={ready && section === 'x'}
          aria-label={ready ? `${label} settings` : `${label}, not supported yet`}
          title={ready ? label : `${label} is not supported yet`}
          onClick={() => onSelect('x')}
        >
          <Icon />
          {id === 'x' && onSite && <span class="rail-live" />}
        </button>
      ))}
      <span class="rail-gap" />
      <button
        type="button"
        class="rail-btn"
        aria-current={section === 'general'}
        aria-label="General settings"
        title="General"
        onClick={() => onSelect('general')}
      >
        <Gear />
      </button>
    </nav>
  );
}
