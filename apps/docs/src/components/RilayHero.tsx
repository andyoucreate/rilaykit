// ============================================================================
// COMPONENT
// ============================================================================

function RilayHero() {
  return (
    <div className="flex flex-col items-center gap-6 pb-8 pt-4 not-prose">
      {/* Large workflow icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className="size-28"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="4" cy="12" r="3" fill="#d4a020" />
        <circle cx="20" cy="6" r="2.5" fill="#d4a020" />
        <circle cx="20" cy="18" r="2.5" fill="#d4a020" />
        <path
          d="M7 12 C12 12, 14 6, 17.5 6"
          stroke="#d4a020"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M7 12 C12 12, 14 18, 17.5 18"
          stroke="#d4a020"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>

      {/* Wordmark */}
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        <span>rilay</span>
        <span className="font-light text-[#d4a020]">kit</span>
      </h1>

      {/* Tagline */}
      <p className="max-w-lg text-center text-lg text-fd-muted-foreground">
        The schema-first form and workflow engine for React.
      </p>

      {/* Badges */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <img
          src="https://img.shields.io/npm/v/@rilaykit/core?style=flat-square&color=d4a020&label=version"
          alt="npm version"
          className="h-5"
        />
        <img
          src="https://img.shields.io/npm/l/@rilaykit/core?style=flat-square&color=d4a020"
          alt="license"
          className="h-5"
        />
        <img
          src="https://img.shields.io/npm/dm/@rilaykit/core?style=flat-square&color=d4a020&label=downloads"
          alt="downloads"
          className="h-5"
        />
      </div>
    </div>
  );
}

export { RilayHero };
