import type { JSX } from 'preact';

/** One drawn set, one stroke weight. The gap in the middle bar is the filter. */
const svg = (props: JSX.SVGAttributes<SVGSVGElement>, path: JSX.Element) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    {...props}
  >
    {path}
  </svg>
);

/** The gavel, filled rather than stroked, from brand/sharp.svg. */
export const Mark = (props: JSX.SVGAttributes<SVGSVGElement>) => (
  <svg viewBox="0 0 100 100" fill="currentColor" aria-hidden="true" class="aitf-mark" {...props}>
    <path d="M43 17 51 14.5 66.5 30 64 38Z" />
    <path d="M43.3 22.2 58.6 37.4 52 44 86.5 75.2 87 83.2 78.5 82.8 47.2 48.5 40 55.5 24.8 40.8Z" />
    <path d="M19.5 40 40.5 60.7 32.7 63.2 17.1 48Z" />
  </svg>
);

export const ShieldCheck = (props: JSX.SVGAttributes<SVGSVGElement>) =>
  svg(
    props,
    <path d="M12 3.2 5 6v5.4c0 4.3 4.6 7.6 7 8.6 2.4-1 7-4.3 7-8.6V6l-7-2.8ZM9 11.9l2.2 2.2 4-4.2" />,
  );

export const ShieldOff = (props: JSX.SVGAttributes<SVGSVGElement>) =>
  svg(
    props,
    <path d="M12 3.2 5 6v5.4c0 4.3 4.6 7.6 7 8.6 2.4-1 7-4.3 7-8.6V6l-7-2.8ZM9.2 11.8h5.6" />,
  );

export const EyeOff = (props: JSX.SVGAttributes<SVGSVGElement>) =>
  svg(
    props,
    <path d="M2.6 12S6.1 5.6 12 5.6 21.4 12 21.4 12 17.9 18.4 12 18.4 2.6 12 2.6 12ZM12 9.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2ZM4.4 4.4l15.2 15.2" />,
  );

export const Eye = (props: JSX.SVGAttributes<SVGSVGElement>) =>
  svg(
    props,
    <path d="M2.6 12S6.1 5.6 12 5.6 21.4 12 21.4 12 17.9 18.4 12 18.4 2.6 12 2.6 12ZM12 9.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Z" />,
  );

export const Check = (props: JSX.SVGAttributes<SVGSVGElement>) =>
  svg(props, <path d="m5 12.5 4.5 4.5L19 7" />);

/** A wand: the reader teaches the model by pointing at a post. */
export const Teach = (props: JSX.SVGAttributes<SVGSVGElement>) =>
  svg(
    props,
    <path d="m4 20 10.5-10.5M13 6l1-3 1 3 3 1-3 1-1 3-1-3-3-1ZM19 13l.6-1.6.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6Z" />,
  );

/** The verdict mark for a close call: same footprint as the gavel, a question
 *  instead of a strike. */
export const Query = (props: JSX.SVGAttributes<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="aitf-mark aitf-mark-query"
    {...props}
  >
    <path d="M8.6 9.2a3.5 3.5 0 1 1 5.3 3c-1.3.8-1.9 1.5-1.9 2.9M12 18.6h.01" />
  </svg>
);
