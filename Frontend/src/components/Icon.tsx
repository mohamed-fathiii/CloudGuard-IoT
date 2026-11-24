import type { SVGProps } from "react";

export type IconName =
  | "grid"
  | "device"
  | "shield"
  | "incident"
  | "response"
  | "database"
  | "settings"
  | "search"
  | "bell"
  | "sun"
  | "moon"
  | "menu"
  | "plus"
  | "arrowLeft"
  | "arrowRight"
  | "chevronDown"
  | "check"
  | "close"
  | "warning"
  | "logout"
  | "user"
  | "clock"
  | "filter"
  | "download"
  | "external"
  | "lock"
  | "activity"
  | "cloud"
  | "file";

const paths: Record<IconName, React.ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
  device: <><rect x="4" y="3" width="16" height="11" /><path d="M8 21h8M12 14v7M8 7h3M8 10h5" /></>,
  shield: <><path d="M12 3 4.5 6v5.5c0 4.4 3 8.1 7.5 9.5 4.5-1.4 7.5-5.1 7.5-9.5V6L12 3Z" /><path d="m9 12 2 2 4-4" /></>,
  incident: <><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 9v5M12 17.2v.1" /></>,
  response: <><path d="M4 12h6M14 12h6" /><path d="m14 6 6 6-6 6M10 6 4 12l6 6" /></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />,
  menu: <><path d="M3 6h18M3 12h18M3 18h18" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  arrowLeft: <><path d="M20 12H4M10 6l-6 6 6 6" /></>,
  arrowRight: <><path d="M4 12h16M14 6l6 6-6 6" /></>,
  chevronDown: <><path d="m6 9 6 6 6-6" /></>,
  check: <path d="m4 12 5 5L20 6" />,
  close: <><path d="M5 5l14 14M19 5 5 19" /></>,
  warning: <><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 9v5M12 17.2v.1" /></>,
  logout: <><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  filter: <><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" /></>,
  download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" /></>,
  external: <><path d="M13 4h7v7M20 4l-9 9" /><path d="M18 14v6H4V6h6" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  activity: <path d="M2 12h4l3-7 5 14 3-7h5" />,
  cloud: <><path d="M7 18a4 4 0 0 1-.4-8A6 6 0 0 1 18 11a3.5 3.5 0 0 1 0 7H7Z" /></>,
  file: <><path d="M6 3h8l5 5v13H6V3Z" /><path d="M14 3v5h5M9 13h7M9 17h7" /></>,
};

export function Icon({ name, ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
