type ReportsIconProps = {
  className?: string;
};

export function ReportsIcon({ className }: ReportsIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* document */}
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />

      {/* chart lines */}
      <line x1="8" y1="14" x2="8" y2="18" />
      <line x1="12" y1="12" x2="12" y2="18" />
      <line x1="16" y1="10" x2="16" y2="18" />
    </svg>
  );
}
