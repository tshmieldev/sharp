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

export const Mark = (props: JSX.SVGAttributes<SVGSVGElement>) =>
  svg({ class: 'aitf-mark', ...props }, <path d="M4 6.5h16M6.5 12h3.2M14.3 12h3.2M9 17.5h6" />);

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
