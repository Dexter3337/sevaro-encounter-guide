import React from "react";
const paths: Record<string, React.ReactNode> = {
  spark: (
    <>
      <path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z" />
      <path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6Z" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2" width="6" height="13" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
    </>
  ),
  stop: <rect x="5" y="5" width="14" height="14" rx="3" />,
  wave: <path d="M2 12h4l3-8 5 16 3-8h5" />,
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  book: (
    <>
      <path d="M12 5v16M3 3c5 0 9 2 9 2s4-2 9-2v16c-5 0-9 2-9 2s-4-2-9-2Z" />
    </>
  ),
  chart: (
    <>
      <path d="M4 3v18h17M8 16v-5m5 5V7m5 9V4" />
    </>
  ),
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  undo: (
    <>
      <path d="M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12" />
    </>
  ),
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.spark}
    </svg>
  );
}
