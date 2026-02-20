// ============================================================================
// TYPES
// ============================================================================

interface RilayLogoProps {
  className?: string;
}

// ============================================================================
// ICON
// ============================================================================

function WorkflowIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      {/* Minimal flow: one node splits into two paths */}
      <circle cx="4" cy="12" r="3" fill="#d4a020" />
      <circle cx="20" cy="6" r="2.5" fill="#d4a020" />
      <circle cx="20" cy="18" r="2.5" fill="#d4a020" />
      <path d="M7 12 C12 12, 14 6, 17.5 6" stroke="#d4a020" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 12 C12 12, 14 18, 17.5 18" stroke="#d4a020" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

function RilayLogo({ className }: RilayLogoProps) {
  return (
    <span className={className}>
      <WorkflowIcon className="size-6 inline-block align-middle" />
      <span className="ml-2 align-middle text-lg font-semibold tracking-tight">rilay</span>
      <span className="align-middle text-lg font-light tracking-tight text-[#d4a020]">kit</span>
    </span>
  );
}

export { RilayLogo, type RilayLogoProps };
