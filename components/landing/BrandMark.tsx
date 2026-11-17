/** BallotBox cube-and-ballot mark, drawn inline so it stays crisp at any size. */
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <rect x="18.5" y="1.5" width="12" height="15" rx="1.6" fill="#FFFFFF" transform="rotate(6 24.5 9)" />
      <path
        d="m21.6 9.1 2.4 2.4 4.6-4.5"
        fill="none"
        stroke="#1B4DD8"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M24 15.5 41.5 25 24 34.5 6.5 25 24 15.5Z" fill="#3B76E8" />
      <path d="M6.5 25 24 34.5V45L6.5 35.5V25Z" fill="#0A2A66" />
      <path d="M41.5 25 24 34.5V45L41.5 35.5V25Z" fill="#1B4DD8" />
    </svg>
  );
}
