import type { JSX } from 'preact';

type IconProps = JSX.SVGAttributes<SVGSVGElement>;

function icon(children: JSX.Element, extra?: Partial<IconProps>) {
  return (props: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      {...extra}
      {...props}
    >
      {children}
    </svg>
  );
}

/** The gap in the middle bar is the filter: something did not get through. */
export const Mark = icon(<path d="M4 6.5h16M6.5 12h3.2M14.3 12h3.2M9 17.5h6" />);
export const Search = icon(
  <path d="M10.8 4.5a6.3 6.3 0 1 0 0 12.6 6.3 6.3 0 0 0 0-12.6ZM15.4 15.4 20 20" />,
);
export const ChevronLeft = icon(<path d="m14.5 5.5-6 6.5 6 6.5" />);
export const ChevronRight = icon(<path d="m9.5 5.5 6 6.5-6 6.5" />);
export const Close = icon(<path d="M6 6 18 18M18 6 6 18" />);
export const Check = icon(<path d="m5 12.5 4.5 4.5L19 7" />);
export const Plus = icon(<path d="M12 5v14M5 12h14" />);
export const Trash = icon(
  <path d="M4.5 6.5h15M9.5 6.5V4.8h5v1.7M6.6 6.5l.8 12.1h9.2l.8-12.1M10.3 10v5M13.7 10v5" />,
);
export const Refresh = icon(<path d="M20 12a8 8 0 1 1-2.6-5.9M20 4.5V10h-5.4" />);
export const Alert = icon(<path d="M12 8.4v4.4M12 16.4h.01M12 3.8 2.9 19.4h18.2L12 3.8Z" />);
export const Eye = icon(
  <path d="M2.6 12S6.1 5.6 12 5.6 21.4 12 21.4 12 17.9 18.4 12 18.4 2.6 12 2.6 12ZM12 9.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Z" />,
);
export const EyeOff = icon(
  <path d="M2.6 12S6.1 5.6 12 5.6 21.4 12 21.4 12 17.9 18.4 12 18.4 2.6 12 2.6 12ZM12 9.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2ZM4.4 4.4l15.2 15.2" />,
);
export const Bolt = icon(<path d="M13.4 3 5.8 13.4h5L10.2 21l7.8-10.6h-5.1L13.4 3Z" />);
export const Clock = icon(
  <path d="M12 4.6a7.4 7.4 0 1 0 0 14.8 7.4 7.4 0 0 0 0-14.8ZM12 8.2V12l2.6 1.9" />,
);
export const Pulse = icon(<path d="M3 12.5h4l2.5-6 4 12 2.6-6H21" />);

export const Star = ({ filled, ...props }: IconProps & { filled?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linejoin="round"
    aria-hidden="true"
    {...props}
  >
    <path d="m12 3.9 2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8L12 3.9Z" />
  </svg>
);

export const Pencil = icon(
  <path d="M4.5 19.5h3.4L18.1 9.3a1.9 1.9 0 0 0 0-2.7l-.7-.7a1.9 1.9 0 0 0-2.7 0L4.5 16.1v3.4ZM13.6 7.4l3 3" />,
);

/* Platform marks are logos, so they are solid glyphs rather than the stroked set. */
const solid = (children: JSX.Element) => (props: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    {children}
  </svg>
);

export const XMark = solid(
  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117Z" />,
);
export const YouTube = solid(
  <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8ZM9.5 15.6V8.4l6.3 3.6Z" />,
);
export const Instagram = solid(
  <>
    <path
      fill-rule="evenodd"
      d="M7.6 2.4h8.8a5.2 5.2 0 0 1 5.2 5.2v8.8a5.2 5.2 0 0 1-5.2 5.2H7.6a5.2 5.2 0 0 1-5.2-5.2V7.6a5.2 5.2 0 0 1 5.2-5.2Zm0 2A3.2 3.2 0 0 0 4.4 7.6v8.8a3.2 3.2 0 0 0 3.2 3.2h8.8a3.2 3.2 0 0 0 3.2-3.2V7.6a3.2 3.2 0 0 0-3.2-3.2Z"
    />
    <path
      fill-rule="evenodd"
      d="M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"
    />
    <circle cx="17.3" cy="6.7" r="1.25" />
  </>,
);
export const Bluesky = solid(
  <path d="M12 10.9C10.9 8.7 7.9 4.7 5.1 2.8 2.4 1 1.4 1.3.7 1.6 0 2 0 3.1 0 3.7c0 .6.35 5.1.6 5.9.8 2.6 3.3 3.4 5.6 3.1-3.4.5-6.4 1.7-2.4 6.1 4.4 4.5 6-1 6.9-3.7l.3-.9.3.9c.9 2.7 2.5 8.2 6.9 3.7 4-4.4 1-5.6-2.4-6.1 2.3.3 4.8-.5 5.6-3.1.25-.8.6-5.3.6-5.9 0-.6 0-1.7-.7-2.1-.7-.3-1.7-.6-4.4 1.2-2.8 1.9-5.8 5.9-6.9 8.1Z" />,
);
export const Gear = solid(
  <path
    fill-rule="evenodd"
    d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm9.3 4.9.93.73a.6.6 0 0 1 .14.77l-1.7 2.94a.6.6 0 0 1-.73.26l-1.1-.44a1 1 0 0 0-.93.1c-.3.2-.6.38-.92.52a1 1 0 0 0-.6.72l-.17 1.17a.6.6 0 0 1-.6.51h-3.4a.6.6 0 0 1-.6-.5l-.17-1.18a1 1 0 0 0-.6-.72 7 7 0 0 1-.92-.53 1 1 0 0 0-.93-.1l-1.1.45a.6.6 0 0 1-.73-.26l-1.7-2.94a.6.6 0 0 1 .14-.77l.93-.73a1 1 0 0 0 .37-.86 6 6 0 0 1 0-1.06 1 1 0 0 0-.37-.85l-.93-.73a.6.6 0 0 1-.14-.77l1.7-2.94a.6.6 0 0 1 .73-.26l1.1.44a1 1 0 0 0 .93-.1c.3-.2.6-.38.92-.52a1 1 0 0 0 .6-.72l.17-1.17a.6.6 0 0 1 .6-.51h3.4a.6.6 0 0 1 .6.5l.17 1.18a1 1 0 0 0 .6.72c.32.14.63.32.92.53a1 1 0 0 0 .93.1l1.1-.45a.6.6 0 0 1 .73.26l1.7 2.94a.6.6 0 0 1-.14.77l-.93.73a1 1 0 0 0-.37.86 6 6 0 0 1 0 1.06 1 1 0 0 0 .37.85Z"
  />,
);

export const Coffee = icon(
  <path d="M4 8h13v6.2A4.8 4.8 0 0 1 12.2 19H8.8A4.8 4.8 0 0 1 4 14.2V8ZM17 9.6h1.6a2.7 2.7 0 0 1 0 5.4H17M7.4 2.6c-.7 1-.7 1.9 0 2.9M11.4 2.6c-.7 1-.7 1.9 0 2.9" />,
);
export const External = icon(
  <path d="M13.5 4.5H19.5V10.5M19.5 4.5 11 13M17 14.6v3.4a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V8.5A1.5 1.5 0 0 1 6 7h3.4" />,
);

export const GitHub = solid(
  <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.2 11.39.6.11.82-.26.82-.58l-.01-2.05c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.96 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.63-2.8 5.65-5.48 5.95.43.37.81 1.1.81 2.22l-.01 3.29c0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5Z" />,
);
