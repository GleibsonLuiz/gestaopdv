import type { ReactElement } from "react";

// SVG inline — zero dependência.
// Uso: <Icon name="search" className="w-4 h-4" />

export type IconName =
  | "search" | "bell" | "clock" | "alert" | "calendar" | "check"
  | "inbox" | "arrow-down" | "pulse" | "rows" | "bag" | "chev"
  | "chev-l" | "chev-r" | "filter" | "download" | "paperclip" | "more";

const paths: Record<IconName, ReactElement> = {
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7Z"/><path d="M10 19a2 2 0 0 0 4 0"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  alert: <><path d="M12 2 1 21h22L12 2Z"/><path d="M12 9v5"/><circle cx="12" cy="17" r=".7" fill="currentColor"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>,
  check: <path d="m4 12 5 5L20 6"/>,
  inbox: <><path d="M3 7h18M5 7v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></>,
  "arrow-down": <><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></>,
  pulse: <path d="M3 12h4l3 8 4-16 3 8h4"/>,
  rows: <path d="M4 6h16M4 12h16M4 18h10"/>,
  bag: <><path d="M3 7h18l-2 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L3 7Z"/><path d="M8 7V5a4 4 0 0 1 8 0v2"/></>,
  chev: <path d="m6 9 6 6 6-6"/>,
  "chev-l": <path d="m15 6-6 6 6 6"/>,
  "chev-r": <path d="m9 6 6 6-6 6"/>,
  filter: <path d="M3 6h18M6 12h12M10 18h4"/>,
  download: <><path d="M12 4v12m0 0-4-4m4 4 4-4"/><path d="M4 20h16"/></>,
  paperclip: <path d="m21 12-8.5 8.5a5 5 0 0 1-7-7L14 5a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L16 7"/>,
  more: <><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></>,
};

interface IconProps {
  name: IconName | string;
  className?: string;
  stroke?: number;
}

export default function Icon({ name, className = "w-3.5 h-3.5", stroke = 1.6 }: IconProps) {
  const node = paths[name as IconName];
  if (!node) return null;
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {node}
    </svg>
  );
}
